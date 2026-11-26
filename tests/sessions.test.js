import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  goPlan,
  hostKind,
  isPaused,
  readStream,
  sessionGroups,
  wakeCommand,
} from "../mods/fleet-lens/sessions.js";

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
const tasks = fixture("tasks");
const terminals = fixture("terminals");
const task = (name) => tasks.find((t) => t.metadata.name === name);

test("a session is paused by its Paused condition or its session state", () => {
  assert.equal(isPaused(task("busy-worker")), true);
  assert.equal(isPaused(task("mission-control")), false);
  const byState = { status: { sessionState: "Paused" } };
  assert.equal(isPaused(byState), true);
});

test("herdr hosts its own sessions; any other runtime is a stream to view", () => {
  assert.equal(hostKind(task("busy-worker")), "herdr");
  assert.equal(hostKind(task("mission-control")), "stream");
  assert.equal(hostKind({ spec: { host: "herdr/local" }, status: {} }), "herdr");
  assert.equal(hostKind({ status: {} }), "stream");
});

test("going to a session focuses a live herdr one and wakes a paused one of any runtime", () => {
  assert.deepEqual(goPlan(task("layout-worker"), terminals), { action: "focus", terminal: "t2" });
  assert.deepEqual(goPlan(task("busy-worker"), terminals), { action: "wake" });
  const pausedMux = structuredClone(task("mission-control"));
  pausedMux.status.sessionState = "Paused";
  assert.deepEqual(goPlan(pausedMux, terminals), { action: "wake" });
  assert.deepEqual(goPlan(task("mission-control"), terminals), { action: "none" });
  assert.deepEqual(goPlan(task("orphan"), terminals), { action: "none" });
});

test("waking runs fleet attach --wake and reads the stream it answers with", () => {
  assert.deepEqual(wakeCommand("vega"), {
    command: "fleet",
    args: ["attach", "vega", "--json", "--wake"],
  });
  assert.deepEqual(
    readStream({ code: 0, stdout: '{"stream":{"argv":["runtime-mux","view","k"]}}', stderr: "" }),
    { ok: true, argv: ["runtime-mux", "view", "k"] },
  );
  assert.deepEqual(readStream({ code: 1, stdout: "", stderr: "error: no such Task\n" }), {
    ok: false,
    error: "error: no such Task",
  });
  assert.equal(readStream({ code: 0, stdout: "{}", stderr: "" }).ok, false);
});

test("the sessions list groups needs-you, live, paused and settled, newest first", () => {
  const groups = sessionGroups(tasks, terminals, new Set());
  assert.deepEqual(
    groups.map((g) => [g.key, g.items.map((i) => [i.name, i.state])]),
    [
      [
        "needs",
        [
          ["layout-worker", "blocked"],
          ["stuck-worker", "working"],
        ],
      ],
      ["live", [["mission-control", "working"]]],
      ["paused", [["busy-worker", "paused"]]],
      [
        "settled",
        [
          ["shipped-worker", "idle"],
          ["orphan", "stopped"],
        ],
      ],
    ],
  );
});

test("a session being woken says so until it runs", () => {
  const groups = sessionGroups(tasks, terminals, new Set(["u400-dddd"]));
  const paused = groups.find((g) => g.key === "paused");
  assert.deepEqual(
    paused.items.map((i) => i.state),
    ["waking"],
  );
});

test("every paused session is listed under Paused, finished ones with their outcome", () => {
  const done = structuredClone(task("shipped-worker"));
  done.status.sessionState = "Paused";
  const groups = sessionGroups([done], [], new Set());
  assert.deepEqual(
    groups.map((g) => [g.key, g.items.map((i) => [i.state, i.outcome])]),
    [["paused", [["paused", "shipped"]]]],
  );
});
