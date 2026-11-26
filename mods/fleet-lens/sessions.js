import {
  attention,
  isPaused,
  liveSessionTerminal,
  openQuestions,
  sessionTerminal,
} from "./model.js";

export { isPaused };

export function hostKind(task, terminals) {
  const host = task.status?.session?.host ?? task.spec?.host ?? "local";
  if (host.startsWith("herdr/")) return "herdr";
  if (sessionTerminal(task, terminals)) return "herdr";
  return host.startsWith("mux/") ? "mux" : "unknown";
}

export function goPlan(task, terminals) {
  if (!task.status?.session) return { action: "none" };
  if (isPaused(task)) return { action: "wake" };
  const terminal = liveSessionTerminal(task, terminals);
  if (terminal) return { action: "focus", terminal };
  return hostKind(task, terminals) === "herdr" ? { action: "wake" } : { action: "none" };
}

export const wakeCommand = (name) => ({
  command: "fleet",
  args: ["attach", name, "--json", "--wake"],
});

export function readStream({ code, stdout, stderr }) {
  if (code !== 0) {
    return { ok: false, error: stderr.trim() };
  }
  try {
    const argv = JSON.parse(stdout)?.stream?.argv;
    if (Array.isArray(argv) && argv.length > 0) return { ok: true, argv };
  } catch {
    return { ok: false, error: "fleet attach printed no JSON" };
  }
  return { ok: false, error: "fleet attach printed no stream" };
}

function sessionState(task, terminals, waking) {
  if (waking.has(task.metadata.uid)) return "waking";
  if (isPaused(task)) return "paused";
  if (!task.status?.session) return "stopped";
  const terminal = sessionTerminal(task, terminals);
  return terminal?.status ?? task.status?.agentState ?? "unknown";
}

const GROUPS = ["needs", "live", "paused", "settled"];

export const GROUP_TITLES = {
  needs: "Needs you",
  live: "Live",
  paused: "Paused",
  settled: "Settled",
};

function groupOf(task, item) {
  if (item.marker) return "needs";
  if (item.state === "paused" || item.state === "waking") return "paused";
  return task.status?.phase === "Concluded" ? "settled" : "live";
}

function toItem(task, terminals, waking) {
  const why = attention(task.status?.conditions);
  const questions = openQuestions(task);
  const marker = why ? "!" : questions.length > 0 ? "?" : null;
  return {
    name: task.metadata.name,
    uid: task.metadata.uid,
    created: task.metadata.creationTimestamp ?? 0,
    marker,
    state: sessionState(task, terminals, waking),
    kind: hostKind(task, terminals),
    space: task.status?.session?.id ?? null,
    outcome: task.status?.result?.outcome ?? null,
    plan: goPlan(task, terminals),
    task,
  };
}

export function sessionGroups(tasks, terminals, waking) {
  const items = (tasks ?? []).map((task) => {
    const item = toItem(task, terminals, waking);
    return { ...item, group: groupOf(task, item) };
  });
  return GROUPS.map((key) => ({
    key,
    items: items.filter((i) => i.group === key).sort((a, b) => b.created - a.created),
  })).filter((g) => g.items.length > 0);
}
