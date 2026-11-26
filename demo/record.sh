#!/usr/bin/env bash
set -euo pipefail

if [ -z "${FLEET_LENS_DEMO_CLEAN:-}" ]; then
  knobs=()
  for name in OUT KEEP DISPLAY_NUM WORK_TIMEOUT PAUSE_TIMEOUT PAUSE_AFTER_MS SPEED TYPE_SPEED VEGA_REPO; do
    [ -n "${!name:-}" ] && knobs+=("$name=${!name}")
  done
  exec env -i FLEET_LENS_DEMO_CLEAN=1 HOME="$HOME" PATH="$PATH" USER="${USER:-}" LANG="${LANG:-C.UTF-8}" \
    TERM="${TERM:-xterm-256color}" SHELL="${SHELL:-/bin/sh}" XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-}" \
    "${knobs[@]}" "$0" "$@"
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${OUT:-$ROOT/media}"
NAME=fleet-lens
RUN=$$
SESSION="fleet-lens-demo-$RUN"
PREFIX="lensdemo$RUN"
SCREEN_W=1600
SCREEN_H=1000
DISPLAY_NUM="${DISPLAY_NUM:-:96}"
WORK_TIMEOUT="${WORK_TIMEOUT:-900}"
PAUSE_TIMEOUT="${PAUSE_TIMEOUT:-300}"
PAUSE_AFTER_MS="${PAUSE_AFTER_MS:-30000}"
SPEED="${SPEED:-10}"
TYPE_SPEED="${TYPE_SPEED:-15}"
VEGA_REPO="${VEGA_REPO:-https://github.com/Thurbeen/vega}"
DEMO="$(mktemp -d /tmp/fleet-lens-demo.XXXX)"

for tool in Xvfb ffmpeg jq git hc herdr-app fleet runtime-herdr claude; do
  command -v "$tool" >/dev/null || { echo "record: $tool is not on PATH" >&2; exit 1; }
done

export HC_SESSION="$SESSION"
export HERDR_APP_HOME="$DEMO/app"
export FLEET_CONFIG="$DEMO/fleet.toml"
export DISABLE_AUTOUPDATER=1
export DISPLAY="$DISPLAY_NUM"
unset TMUX

pids=()
cleanup() {
  herdr-app "do" window.close >/dev/null 2>&1 || true
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  for t in $(hc ls --all 2>/dev/null | jq -r '.terminals[].address'); do hc kill "$t" >/dev/null 2>&1 || true; done
  hc server stop >/dev/null 2>&1 || true
  rm -rf "${XDG_DATA_HOME:-$HOME/.local/share}/runtime-herdr/workspaces/local/$PREFIX."*
  find "${XDG_STATE_HOME:-$HOME/.local/state}/runtime-herdr" -name "$PREFIX.*.start" -delete 2>/dev/null || true
  if [ -z "${KEEP:-}" ]; then rm -rf "$DEMO"; else echo "kept $DEMO" >&2; fi
}
trap cleanup EXIT

step() { printf '[record] %s\n' "$*" >&2; }
app() { herdr-app "do" "$@" >/dev/null; }
lens() { app "fleet-lens.$1"; sleep "${2:-0.8}"; }
now_ms() { date +%s%3N; }
speed() { echo "$1 $(now_ms)" >>"$DEMO/marks"; }
shoot_every() { echo "$1" >"$DEMO/interval"; }
session_of() { fleet get task "$1" 2>/dev/null | jq -r '.status.session.id // empty'; }
live_terminal() {
  local id
  id="$(session_of "$1")"
  [ -n "$id" ] || return 0
  hc ls --label "fleet.key=$id" 2>/dev/null | jq -r '[.terminals[] | select(.state == "live") | .address][0] // empty'
}

type_into() {
  local terminal="$1" text="$2" i c
  for ((i = 0; i < ${#text}; i++)); do
    c="${text:i:1}"
    case "$c" in
      " ") c=space ;;
      [A-Z]) c="shift+${c,,}" ;;
    esac
    hc keys "$terminal" "$c" >/dev/null
    sleep 0.04
  done
}

step "scratch $DEMO, herdr-core session $SESSION, key prefix $PREFIX"
mkdir -p "$DEMO/app" "$DEMO/frames" "$DEMO/src/api" "$DEMO/src/web" "$DEMO/src/docs"
cat >"$FLEET_CONFIG" <<TOML
version = 1

[data]
dir = "$DEMO/store"

[runtimes.herdr]
program = "runtime-herdr"
keyPrefix = "$PREFIX"

[runtimes.herdr.places.local]
session = "$SESSION"
TOML

cat >"$DEMO/src/api/server.py" <<'PY'
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_error(404)


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
PY
printf '%s\n' '<!doctype html>' '<title>Acme</title>' '<footer>© 2024 Acme</footer>' >"$DEMO/src/web/index.html"
printf '%s\n' '# Acme' '' 'The Acme service.' >"$DEMO/src/docs/README.md"
for repo in api web docs; do
  (cd "$DEMO/src/$repo" && git init -q -b main && git add . &&
    git -c user.name=demo -c user.email=demo@example.invalid commit -qm "$repo")
done

git clone -q "$VEGA_REPO" "$DEMO/vega"
jq -n --argjson ms "$PAUSE_AFTER_MS" \
  '{apiVersion: "fleet/v1alpha1", kind: "TaskConfig", metadata: {name: "default"}, spec: {pauseAfterMs: $ms}}' \
  >"$DEMO/task-config.json"

"$ROOT/install.sh" --home "$DEMO/app" --store "$DEMO/store" >/dev/null
printf '{"layout":"fleet","frame.welcomed":"skipped"}' >"$DEMO/app/shared.json"
printf '{"state":"maximized","bounds":[0.0,0.0,%s.0,%s.0]}' "$SCREEN_W" "$SCREEN_H" >"$DEMO/app/window.json"
printf '{"last_run":"%s","presented":[]}' "$(herdr-app --version | awk '{print $2}')" >"$DEMO/app/update-notes.json"

step "Xvfb $DISPLAY, herdr-app, fleet up"
Xvfb "$DISPLAY" -screen 0 "${SCREEN_W}x${SCREEN_H}x24" -nolisten tcp -nocursor >/dev/null 2>&1 &
pids+=($!)
sleep 2
herdr-app >"$DEMO/app.log" 2>&1 &
pids+=($!)
for _ in $(seq 1 30); do herdr-app status >/dev/null 2>&1 && break; sleep 1; done
fleet up >"$DEMO/fleet-up.log" 2>&1 &
pids+=($!)

trust_watch() {
  while :; do
    for t in $(hc ls | jq -r '.terminals[] | select(.agent == "claude-code" or .agent == "claude") | .address'); do
      screen="$(hc read "$t" 2>/dev/null | tail -12)"
      if printf '%s' "$screen" | grep -q "Yes, I trust this folder"; then
        printf '%s' "$screen" | grep -q "❯ Yes, I trust this folder" || hc keys "$t" down >/dev/null 2>&1 || true
        hc keys "$t" enter >/dev/null 2>&1 || true
      fi
    done
    sleep 2
  done
}
trust_watch &
pids+=($!)

shoot() {
  while :; do
    herdr-app shot "$DEMO/frames/$(now_ms).png" >/dev/null 2>&1 || true
    sleep "$(cat "$DEMO/interval")"
  done
}

step "install VEGA"
"$DEMO/vega/install.sh" --config "$FLEET_CONFIG" --harness claude >"$DEMO/vega-install.log" 2>&1
vega_terminal=
for _ in $(seq 1 120); do
  vega_terminal="$(live_terminal vega)"
  [ -n "$vega_terminal" ] && break
  sleep 2
done
[ -n "$vega_terminal" ] || { KEEP=1; step "VEGA did not start"; exit 1; }
for _ in $(seq 1 90); do
  [ "$(fleet get task vega | jq -r '.status.agentState // empty')" = idle ] && break
  sleep 2
done
app agent.focus --terminal "$vega_terminal"
shoot_every 0
sleep 3

REQUEST="Dispatch three workers at once, one per repository in $DEMO/src. In api, answer GET /health with 200 and ok. In web, change the footer year to 2026. In docs, add a status badge to the README, but before editing ask me which badge style, flat or for-the-badge, and wait for my answer. Each worker commits on its own branch. Local only, no push and no pull request."

step "record"
shoot &
shooter=$!
pids+=("$shooter")
speed 1
sleep 3
speed "$TYPE_SPEED"
type_into "$vega_terminal" "$REQUEST"
speed 1
sleep 1
hc keys "$vega_terminal" enter >/dev/null
fleet apply -f "$DEMO/task-config.json" >/dev/null
sleep 4

step "VEGA applies the workers"
speed "$SPEED"
shoot_every 1
workers() { fleet list task --json | jq -r '.[] | select(.metadata.labels["gateway.fleet.dev/parent"] == "vega") | .metadata.name'; }
declare -A focused=()
declare -A unsent_since=()
unsent() {
  local t="$1" name="$2"
  [ "$(fleet get task "$name" | jq -r '.status.agentState // empty')" != working ] &&
    hc read "$t" 2>/dev/null | tail -25 | grep -q '^❯ [^ ]'
}
deadline=$(($(date +%s) + WORK_TIMEOUT))
done_work=
while [ "$(date +%s)" -lt "$deadline" ]; do
  mapfile -t names < <(workers)
  for n in "${names[@]}"; do
    t="$(live_terminal "$n")"
    if [ -n "$t" ] && [ -z "${focused[$n]:-}" ]; then
      focused[$n]=1
      app agent.focus --terminal "$t"
      sleep 8
    fi
    if [ -n "$t" ] && unsent "$t" "$n"; then
      unsent_since[$n]="${unsent_since[$n]:-$(date +%s)}"
      if [ $(($(date +%s) - unsent_since[$n])) -gt 90 ]; then
        KEEP=1
        step "the brief of $n sat unsent in its composer for 90s: no clip written"
        exit 1
      fi
    else
      unset "unsent_since[$n]"
    fi
  done
  shipped=$(fleet list task --json | jq '[.[] | select(.metadata.labels["gateway.fleet.dev/parent"] == "vega" and .status.result.outcome == "shipped")] | length')
  asked=$(fleet list task --json | jq '[.[] | select(.metadata.labels["gateway.fleet.dev/parent"] == "vega") | .status.declared[]? | select(.kind == "Question")] | length')
  if [ "$shipped" -ge 2 ] && [ "$asked" -ge 1 ]; then done_work=1; break; fi
  sleep 4
done
[ -n "$done_work" ] || { KEEP=1; step "the workers did not ship and ask in ${WORK_TIMEOUT}s: no clip written"; exit 1; }
app agent.focus --terminal "$vega_terminal"
sleep 8
speed 1
shoot_every 0
sleep 2

step "the Lens"
app mod.open --name fleet-lens
sleep 4
lens down 2.2
lens down 2.2
lens down 2.2
lens open 1.5
for _ in $(seq 1 14); do lens down 0.15; done
sleep 1.2
lens back 1.0
lens nextKind 1.6
lens nextKind 1.0
lens prevKind 0.6
lens prevKind 1.2
lens close 2

step "Fleet pauses the idle sessions"
speed "$SPEED"
shoot_every 1
paused_worker() {
  fleet list task --json | jq -r '[.[] | select(.metadata.labels["gateway.fleet.dev/parent"] == "vega"
    and .status.result.outcome == "shipped"
    and any(.status.conditions[]?; .type == "Paused" and .status == "True"))][0].metadata.name // empty'
}
target=
deadline=$(($(date +%s) + PAUSE_TIMEOUT))
while [ "$(date +%s)" -lt "$deadline" ]; do
  target="$(paused_worker)"
  [ -n "$target" ] && break
  sleep 3
done
[ -n "$target" ] || { KEEP=1; step "no shipped worker was paused in ${PAUSE_TIMEOUT}s: no clip written"; exit 1; }
sleep 4
speed 1
shoot_every 0
sleep 3

step "wake $target from the Lens"
app mod.open --name fleet-lens
sleep 2
row=$(fleet list task --json | jq -r --arg target "$target" '
  def needs: ((.status.conditions // []) | any(.type == "NeedsAttention" and .status == "True"))
    or (([.status.declared[]? | select(.kind == "Question") | .id] - ((.status.answered // {}) | keys)) | length > 0);
  def settled: .status.phase == "Concluded" or .status.phase == "Settled";
  sort_by([(if needs then 0 elif settled then 2 else 1 end), -(.metadata.creationTimestamp)])
  | map(.metadata.name) | index($target)')
lens first 0.5
for _ in $(seq 1 "$row"); do lens down 0.5; done
sleep 1.5
lens wake 1
for _ in $(seq 1 90); do
  [ -n "$(live_terminal "$target")" ] && break
  sleep 1
done
sleep 5
speed 1

kill "$shooter" 2>/dev/null || true
wait "$shooter" 2>/dev/null || true

step "encode"
"$ROOT/demo/encode.sh" "$DEMO" "$OUT" "$NAME" >/dev/null
step "wrote $OUT/$NAME.mp4 and $OUT/$NAME.gif"
