import assert from "node:assert/strict";
import { test } from "node:test";
import { toYaml } from "../mods/fleet-lens/yaml.js";

test("the envelope comes first, then the other fields by name", () => {
  const lines = toYaml({
    status: { b: 1, a: 2 },
    zeta: true,
    kind: "Task",
    apiVersion: "fleet/v1",
  });
  assert.deepEqual(lines, [
    "apiVersion: fleet/v1",
    "kind: Task",
    "status:",
    "  a: 2",
    "  b: 1",
    "zeta: true",
  ]);
});

test("lists, empty values, nulls and nested objects", () => {
  assert.deepEqual(
    toYaml({ list: [{ id: "q1", text: "hi" }, "plain"], none: [], empty: {}, gone: null }),
    ["empty: {}", "gone: null", "list:", "  - id: q1", "    text: hi", "  - plain", "none: []"],
  );
});

test("multi-line strings are blocks; ambiguous strings are quoted", () => {
  assert.deepEqual(toYaml({ text: "one\ntwo", flag: "true", n: "42", colon: "a: b", blank: "" }), [
    'blank: ""',
    'colon: "a: b"',
    'flag: "true"',
    'n: "42"',
    "text: |",
    "  one",
    "  two",
  ]);
});
