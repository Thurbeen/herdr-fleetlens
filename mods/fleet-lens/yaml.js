const ENVELOPE = ["apiVersion", "kind", "metadata", "spec", "status"];
const AMBIGUOUS = /^(true|false|null|yes|no|on|off|~|-?\d+(\.\d+)?)$/i;
const NEEDS_QUOTES = /^[\s\-?:,[\]{}#&*!|>'"%@`]|:\s|\s#|\s$/;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function orderedKeys(obj, top) {
  const keys = Object.keys(obj).sort();
  if (!top) return keys;
  const envelope = ENVELOPE.filter((k) => Object.hasOwn(obj, k));
  return [...envelope, ...keys.filter((k) => !ENVELOPE.includes(k))];
}

function scalar(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "string") return String(value);
  if (value === "" || AMBIGUOUS.test(value) || NEEDS_QUOTES.test(value))
    return JSON.stringify(value);
  return value;
}

const empty = (v) =>
  Array.isArray(v) ? v.length === 0 : isObject(v) && Object.keys(v).length === 0;

function entry(prefix, value, indent) {
  if (empty(value)) return [`${prefix} ${Array.isArray(value) ? "[]" : "{}"}`];
  if (Array.isArray(value)) return [prefix, ...list(value, indent + 2)];
  if (isObject(value)) return [prefix, ...mapping(value, indent + 2, false)];
  if (typeof value === "string" && value.includes("\n")) {
    const pad = " ".repeat(indent + 2);
    return [
      `${prefix} |`,
      ...value
        .replace(/\n$/, "")
        .split("\n")
        .map((l) => `${pad}${l}`),
    ];
  }
  return [`${prefix} ${scalar(value)}`];
}

function mapping(obj, indent, top) {
  const pad = " ".repeat(indent);
  return orderedKeys(obj, top).flatMap((key) => entry(`${pad}${scalar(key)}:`, obj[key], indent));
}

function list(items, indent) {
  const pad = " ".repeat(indent);
  return items.flatMap((item) => {
    if (isObject(item) && !empty(item)) {
      const [first, ...rest] = mapping(item, indent + 2, false);
      return [`${pad}- ${first.trimStart()}`, ...rest];
    }
    return entry(`${pad}-`, item, indent);
  });
}

export function toYaml(obj) {
  return isObject(obj) ? mapping(obj, 0, true) : [scalar(obj)];
}
