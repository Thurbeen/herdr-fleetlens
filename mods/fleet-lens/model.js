const ATTENTION = "NeedsAttention";
const PARENT_LABEL = "gateway.fleet.dev/parent";
const SESSION_LABEL = "fleet.key";
const SETTLED = new Set(["Concluded", "Settled"]);
const GLYPH = { True: "●", False: "○" };

const AGENT_TONE = { attention: "warn", idle: "muted", unknown: "muted" };
const SESSION_TONE = { Lost: "bad", Gone: "bad", Paused: "muted", Idle: "muted" };
const RESULT_TONE = { shipped: "ok", stuck: "warn", failed: "bad" };
const LIVE_TONE = { working: "working", blocked: "blocked", done: "done", idle: "idle" };

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;

export function age(ms) {
  if (typeof ms !== "number" || Number.isNaN(ms) || ms < 0) return "-";
  const seconds = Math.floor(ms / 1000);
  if (seconds < MINUTE) return `${seconds}s`;
  if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)}m`;
  if (seconds < DAY) return `${Math.floor(seconds / HOUR)}h`;
  return `${Math.floor(seconds / DAY)}d`;
}

export function glyphs(conditions) {
  return (conditions ?? [])
    .filter((c) => c.type !== ATTENTION)
    .map((c) => GLYPH[c.status] ?? "?")
    .join("");
}

export function attention(conditions) {
  const c = (conditions ?? []).find((x) => x.type === ATTENTION && x.status === "True");
  if (!c) return null;
  const reason = c.reason ?? ATTENTION;
  return c.message ? `${reason}: ${c.message}` : reason;
}

const declared = (obj, kind) => (obj.status?.declared ?? []).filter((d) => d.kind === kind);

const isAnswered = (obj) => {
  const answered = obj.status?.answered ?? {};
  return (q) => Object.hasOwn(answered, q.id);
};

export function openQuestions(obj) {
  const answered = isAnswered(obj);
  return declared(obj, "Question")
    .filter((q) => !answered(q))
    .map(({ id, text }) => ({ id, text: text ?? "" }));
}

export function answeredQuestions(obj) {
  const answered = isAnswered(obj);
  return declared(obj, "Question")
    .filter(answered)
    .map(({ id, text }) => ({ id, text: text ?? "" }));
}

export function change(url) {
  if (typeof url !== "string" || url === "") return "-";
  const github = url.match(/^https?:\/\/[^/]+\/(.+?)\/pull\/(\d+)/);
  if (github) return `${github[1]}#${github[2]}`;
  const gitlab = url.match(/^https?:\/\/[^/]+\/(.+?)\/-\/merge_requests\/(\d+)/);
  if (gitlab) return `${gitlab[1]}!${gitlab[2]}`;
  return url;
}

export function columns(kind) {
  if (kind === "Task") {
    return ["NAME", "PHASE", "AGENT", "SESSION", "HERDR", "GEN", "RESULT", "CR", "AGE"];
  }
  if (kind === "ChangeRequest") return ["NAME", "CHANGE", "PHASE", "COND", "SYNC", "AGE"];
  return ["NAME", "PHASE", "COND", "SYNC", "AGE"];
}

export function isPaused(task) {
  const status = task.status ?? {};
  if (status.sessionState === "Paused") return true;
  return (status.conditions ?? []).some((c) => c.type === "Paused" && c.status === "True");
}

export function liveSessionTerminal(obj, terminals) {
  const key = `fleet.${obj.metadata?.uid}`;
  const live = (terminals ?? []).find(
    (t) => t.labels?.[SESSION_LABEL] === key && t.state === "live",
  );
  return live?.address ?? null;
}

export function sessionTerminal(obj, terminals) {
  const key = `fleet.${obj.metadata?.uid}`;
  const matches = (terminals ?? []).filter((t) => t.labels?.[SESSION_LABEL] === key);
  const chosen = matches.find((t) => t.state === "live") ?? matches[0];
  return chosen ? { address: chosen.address, status: chosen.status } : null;
}

export function relations(kind, obj, tasks) {
  const out = [];
  const add = (to, name, role) => {
    if (typeof name === "string" && name !== "")
      out.push(role ? { kind: to, name, role } : { kind: to, name });
  };
  if (kind === "Task") {
    add("TaskConfig", obj.spec?.configRef?.name);
    for (const fact of obj.status?.declared ?? []) add(fact.kind, fact.name);
    add("Task", obj.metadata?.labels?.[PARENT_LABEL], "parent");
    for (const t of tasks ?? []) {
      if (t.metadata?.labels?.[PARENT_LABEL] === obj.metadata?.name) {
        add("Task", t.metadata.name, "child");
      }
    }
  }
  if (kind === "TaskConfig") {
    for (const ref of obj.spec?.envFrom ?? []) add("EnvProvider", ref.name);
  }
  return out;
}

const c = (text, tone = null) => ({ text, tone });

const phaseTone = (phase) => {
  if (SETTLED.has(phase)) return "ok";
  return phase === "Stalled" ? "bad" : null;
};

function sessionCell(status) {
  const state = status.sessionState;
  if (!status.session && !state) return c("-");
  const host = status.session?.host;
  const where = host && host !== "local" && host !== "herdr/local" ? `${host} ` : "";
  return c(`${where}${state ?? "?"}`, SESSION_TONE[state] ?? null);
}

function generationCell(obj) {
  const brief = obj.status?.brief?.generation;
  if (brief === undefined) return c("-");
  const spec = obj.metadata?.generation ?? 0;
  return c(`${brief}/${spec}`, brief === spec ? null : "bad");
}

function herdrCell(obj, terminal) {
  if (terminal) return c(terminal.status, LIVE_TONE[terminal.status] ?? null);
  return isPaused(obj) ? c("paused", "muted") : c("-");
}

function taskCells(obj, terminal) {
  const status = obj.status ?? {};
  const agent = status.agentState ?? "-";
  const outcome = status.result?.outcome ?? "-";
  const crs = declared(obj, "ChangeRequest").length;
  return [
    c(agent, AGENT_TONE[agent] ?? null),
    sessionCell(status),
    herdrCell(obj, terminal),
    generationCell(obj),
    c(outcome, RESULT_TONE[outcome] ?? null),
    c(crs > 0 ? String(crs) : "-"),
  ];
}

function syncCell(obj) {
  const generation = obj.metadata?.generation;
  const seen = obj.status?.observedGeneration ?? generation;
  return seen === generation ? c("✓") : c("±", "warn");
}

function markerOf(kind, obj) {
  if (kind !== "Task") return { marker: null, why: null };
  const why = attention(obj.status?.conditions);
  if (why) return { marker: "!", why };
  const [question] = openQuestions(obj);
  if (!question) return { marker: null, why: null };
  const firstLine = question.text.split("\n")[0];
  return {
    marker: "?",
    why: firstLine ? `${question.id}: ${firstLine}` : `${question.id} waits for an answer`,
  };
}

function toRow(kind, obj, { now, terminals, objects }) {
  const status = obj.status ?? {};
  const meta = obj.metadata ?? {};
  const created = meta.creationTimestamp ?? 0;
  const { marker, why } = markerOf(kind, obj);
  const terminal = kind === "Task" ? sessionTerminal(obj, terminals) : null;
  const name = meta.deletionTimestamp ? `✕ ${meta.name}` : (meta.name ?? "?");
  const cells = [
    c(name, marker === "!" ? "bad" : null),
    ...(kind === "ChangeRequest" ? [c(change(obj.spec?.url))] : []),
    c(status.phase ?? "-", phaseTone(status.phase)),
    ...(kind === "Task" ? taskCells(obj, terminal) : [c(glyphs(status.conditions)), syncCell(obj)]),
    c(age(now === undefined ? undefined : now - created)),
  ];
  return {
    name: meta.name,
    marker,
    why,
    settled: SETTLED.has(status.phase),
    created,
    cells,
    related: relations(kind, obj, objects),
    terminal: terminal?.address ?? null,
    live: terminal?.status ?? null,
    questions: kind === "Task" ? openQuestions(obj) : [],
    answered: kind === "Task" ? answeredQuestions(obj) : [],
    result: status.result ?? null,
    object: obj,
  };
}

function compareRows(a, b) {
  if (Boolean(a.marker) !== Boolean(b.marker)) return a.marker ? -1 : 1;
  if (a.settled !== b.settled) return a.settled ? 1 : -1;
  if (a.created !== b.created) return b.created - a.created;
  return (a.name ?? "").localeCompare(b.name ?? "");
}

export function rows(kind, objects, { now, terminals } = {}) {
  return (objects ?? [])
    .map((obj) => toRow(kind, obj, { now, terminals, objects }))
    .sort(compareRows);
}

export function needYou(list) {
  return list.filter((r) => r.marker).length;
}

const SECTION_OF = (row) => {
  if (row.marker) return "needs";
  return row.settled ? "settled" : "open";
};

export const SECTION_TITLES = { needs: "Needs you", open: "Open", settled: "Settled" };

export function withSections(list) {
  const items = [];
  list.forEach((row, index) => {
    const key = SECTION_OF(row);
    if (index === 0 || SECTION_OF(list[index - 1]) !== key) {
      items.push({ type: "section", key, count: list.filter((r) => SECTION_OF(r) === key).length });
    }
    items.push({ type: "row", index });
  });
  return items;
}

export function itemIndex(items, rowIndex) {
  return items.findIndex((item) => item.type === "row" && item.index === rowIndex);
}

const REQUEST_LABEL = "vega.fleet.dev/request";

export function filterRows(list, query) {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return list;
  return list.filter((row) =>
    [row.name, row.object?.metadata?.labels?.[REQUEST_LABEL]]
      .filter(Boolean)
      .some((text) => text.toLowerCase().includes(q)),
  );
}

const isWeb = (url) => typeof url === "string" && /^https?:\/\//.test(url);

const declaredUrls = (obj) =>
  declared(obj, "ChangeRequest")
    .map((cr) => cr.url)
    .filter(isWeb);

export function primaryUrl(row) {
  const obj = row.object ?? {};
  if (obj.kind === "ChangeRequest") return isWeb(obj.spec?.url) ? obj.spec.url : null;
  const artifact = (row.result?.artifacts ?? []).find(isWeb);
  return artifact ?? declaredUrls(obj)[0] ?? null;
}

const BRIEF_LINES = 6;
const RESULT_TONE_OF = { shipped: "ok", stuck: "warn", failed: "bad" };

const linkItem = (url) => ({ text: change(url), url });

function conditionItems(obj) {
  return (obj.status?.conditions ?? [])
    .filter((c) => c.type !== ATTENTION)
    .map((c) => {
      const why = [c.reason, c.message].filter(Boolean).join(": ");
      return { label: GLYPH[c.status] ?? "?", text: why ? `${c.type} · ${why}` : c.type };
    });
}

function taskPreview(row) {
  const obj = row.object;
  const request = obj.metadata?.labels?.[REQUEST_LABEL];
  const brief = (obj.spec?.brief ?? "").split("\n").filter(Boolean).slice(0, BRIEF_LINES);
  return [
    row.marker === "!" && { title: "Needs attention", tone: "bad", items: [{ text: row.why }] },
    row.questions.length > 0 && {
      title: "Open questions",
      tone: "warn",
      items: row.questions.map((q) => ({ label: q.id, text: q.text })),
    },
    (request || brief.length > 0) && {
      title: "Request",
      tone: null,
      items: [
        ...(request ? [{ text: request }] : []),
        ...brief.map((text) => ({ text, dim: true })),
      ],
    },
    row.result && {
      title: "Result",
      tone: RESULT_TONE_OF[row.result.outcome] ?? null,
      outcome: row.result.outcome,
      items: [
        ...(row.result.summary ? [{ text: row.result.summary }] : []),
        ...(row.result.artifacts ?? []).filter(isWeb).map(linkItem),
      ],
    },
    declaredUrls(obj).length > 0 && {
      title: "Change requests",
      tone: null,
      items: declaredUrls(obj).map(linkItem),
    },
    row.answered.length > 0 && {
      title: "Answered",
      tone: "muted",
      items: row.answered.map((q) => ({ label: q.id, text: q.text.split("\n")[0], dim: true })),
    },
  ].filter(Boolean);
}

export function preview(row) {
  if (!row) return [];
  if (row.object?.kind === "Task") return taskPreview(row);
  const items = conditionItems(row.object ?? {});
  return items.length > 0 ? [{ title: "Conditions", tone: null, items }] : [];
}
