export const VERSION = { command: "fleet", args: ["version", "--json"] };

export const FALLBACK_REFRESH_MS = 30000;
export const UNWATCHED_REFRESH_MS = 5000;

export const PLUGINS = { command: "fleet", args: ["list", "plugins", "--json"] };

export const listCommand = (kind) => ({ command: "fleet", args: ["list", kind, "--json"] });

function parse({ code, stdout, stderr }) {
  if (code !== 0) return { ok: false, error: `fleet exited ${code}: ${stderr.trim()}` };
  try {
    return { ok: true, value: JSON.parse(stdout) };
  } catch (error) {
    return { ok: false, error: `fleet printed no JSON: ${error.message}` };
  }
}

export function readList(result) {
  const read = parse(result);
  if (!read.ok) return read;
  const objects = Array.isArray(read.value) ? read.value : read.value?.items;
  return Array.isArray(objects)
    ? { ok: true, objects }
    : { ok: false, error: "fleet printed no list" };
}

export function readKinds(result) {
  const read = parse(result);
  if (!read.ok) return read;
  const kinds = read.value?.kinds;
  if (!Array.isArray(kinds)) return { ok: false, error: "fleet version printed no kinds" };
  const ordered = [...kinds.filter((k) => k === "Task"), ...kinds.filter((k) => k !== "Task")];
  return { ok: true, version: read.value.version ?? "?", kinds: ordered };
}

export function storeWatchDir(store) {
  if (!store) return null;
  return `${store.replace(/\/+$/, "")}/objects`;
}

export function openUrlCommand(platform, url) {
  if (typeof url !== "string" || !/^https?:\/\//.test(url)) return null;
  if (platform === "macos") return { command: "open", args: [url] };
  if (platform === "windows") return { command: "cmd", args: ["/c", "start", "", url] };
  return { command: "xdg-open", args: [url] };
}

export function readPluginKinds(result) {
  const read = parse(result);
  if (!read.ok) return read;
  const plugins = Array.isArray(read.value) ? read.value : (read.value?.plugins ?? []);
  const kinds = plugins.filter((p) => p.available !== false).flatMap((p) => p.kinds ?? []);
  return { ok: true, kinds };
}

export function mergeKinds(core, custom) {
  return [...new Set([...core, ...custom])];
}
