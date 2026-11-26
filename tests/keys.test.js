import assert from "node:assert/strict";
import { test } from "node:test";
import { actionFor, HINTS } from "../mods/fleet-lens/keys.js";

test("the list keys match fleetlens, plus s for the herdr session", () => {
  const list = (k) => actionFor("list", k);
  assert.deepEqual(
    ["j", "down", "k", "up", "pagedown", "pageup", "g", "home", "shift-g", "end"].map(list),
    ["down", "down", "up", "up", "pageDown", "pageUp", "first", "first", "last", "last"],
  );
  assert.deepEqual(
    ["tab", "ctrl-l", "shift-tab", "ctrl-h", "enter", "shift-r", "s", "escape", "q"].map(list),
    [
      "nextKind",
      "nextKind",
      "prevKind",
      "prevKind",
      "open",
      "refresh",
      "session",
      "close",
      "close",
    ],
  );
});

test("reading a resource scrolls it and esc goes back", () => {
  const detail = (k) => actionFor("detail", k);
  assert.deepEqual(["j", "k", "g", "shift-g", "escape", "q", "s", "enter", "tab"].map(detail), [
    "down",
    "up",
    "first",
    "last",
    "back",
    "back",
    "session",
    "back",
    "nextKind",
  ]);
});

test("unknown keys do nothing", () => {
  assert.equal(actionFor("list", "x"), null);
  assert.equal(actionFor("detail", "ctrl-c"), null);
});

test("every footer hint names a key that acts in its mode", () => {
  for (const [mode, hints] of Object.entries(HINTS)) {
    for (const hint of hints) assert.ok(actionFor(mode, hint.key), `${mode} ${hint.key}`);
  }
});

test("slash filters and o opens the row's link", () => {
  assert.equal(actionFor("list", "/"), "filter");
  assert.equal(actionFor("list", "o"), "openUrl");
  assert.equal(actionFor("detail", "o"), "openUrl");
});

test("w wakes a paused session from the list or while reading it", () => {
  assert.equal(actionFor("list", "w"), "wake");
  assert.equal(actionFor("detail", "w"), "wake");
});
