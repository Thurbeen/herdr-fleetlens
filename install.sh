#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: install.sh --home <herdr-app home> [--store <fleet data dir>] [--bin <fleet program>]" >&2
  echo "  --home   where herdr-app reads mods and layouts, e.g. ~/.config/herdr-app" >&2
  echo "  --store  Fleet's data.dir; without it the Lens refreshes on a timer" >&2
  echo "  --bin    the fleet program to run; default: fleet on PATH" >&2
  exit 2
}

home=""
store=""
bin=""
while [ $# -gt 0 ]; do
  case "$1" in
    --home) home="${2:-}"; shift 2 ;;
    --store) store="${2:-}"; shift 2 ;;
    --bin) bin="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done
[ -n "$home" ] || usage

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mod_dir="$home/mods/fleet-lens"

mkdir -p "$mod_dir" "$home/layouts"
cp "$repo"/mods/fleet-lens/*.js "$repo"/mods/fleet-lens/*.png "$repo/mods/fleet-lens/mod.json" "$mod_dir/"
cp "$repo/layouts/fleet.json" "$home/layouts/fleet.json"
if [ -n "$store" ] || [ -n "$bin" ]; then
  jq -n --arg store "$store" --arg bin "$bin" \
    '{store: $store, bin: $bin} | with_entries(select(.value != ""))' > "$mod_dir/config.json"
else
  rm -f "$mod_dir/config.json"
fi

echo "installed fleet-lens into $mod_dir"
echo "open the Lens from the palette (Fleet: open Lens) or: herdr-app do mod.open --name fleet-lens"
echo "show Fleet sessions in the sidebar: herdr-app do layout.switch --name fleet"
