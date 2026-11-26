import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  age,
  attention,
  change,
  columns,
  filterRows,
  glyphs,
  itemIndex,
  needYou,
  openQuestions,
  preview,
  primaryUrl,
  relations,
  rows,
  withSections,
} from "../mods/fleet-lens/model.js";

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
const tasks = fixture("tasks");
const others = fixture("others");
const terminals = fixture("terminals");
const now = 1795000500000;
const task = (name) => tasks.find((t) => t.metadata.name === name);
const taskRows = () => rows("Task", tasks, { now, terminals });
const row = (name) => taskRows().find((r) => r.name === name);
const cell = (r, title) => r.cells[columns("Task").indexOf(title)];

test("age reads like fleetlens: seconds, minutes, hours, days", () => {
  assert.equal(age(5000), "5s");
  assert.equal(age(120000), "2m");
  assert.equal(age(7200000), "2h");
  assert.equal(age(3 * 86400000), "3d");
  assert.equal(age(-1), "-");
  assert.equal(age(undefined), "-");
});

test("conditions become glyphs, leaving NeedsAttention to the marker", () => {
  assert.equal(
    glyphs([
      { type: "Ready", status: "True" },
      { type: "NeedsAttention", status: "True" },
      { type: "Valid", status: "False" },
      { type: "Odd", status: "Unknown" },
    ]),
    "●○?",
  );
  assert.equal(glyphs(undefined), "");
});

test("a true NeedsAttention reads as its reason and message", () => {
  assert.equal(
    attention(task("stuck-worker").status.conditions),
    "DeliveryUnconfirmed: inbox entry could not be confirmed",
  );
  assert.equal(attention([{ type: "NeedsAttention", status: "False" }]), null);
});

test("every unanswered Question is open, with its full text", () => {
  assert.deepEqual(openQuestions(task("layout-worker")), [{ id: "q2", text: "Pick a name?" }]);
  assert.deepEqual(openQuestions(task("shipped-worker")), []);
});

test("a change URL reads as owner/repo#N or group/project!N", () => {
  assert.equal(change("https://github.com/acme/app/pull/22"), "acme/app#22");
  assert.equal(change("https://gitlab.com/grp/sub/proj/-/merge_requests/3"), "grp/sub/proj!3");
  assert.equal(change("https://example.com/x"), "https://example.com/x");
  assert.equal(change(undefined), "-");
});

test("each kind has its columns, Tasks with herdr's live session", () => {
  assert.deepEqual(columns("Task"), [
    "NAME",
    "PHASE",
    "AGENT",
    "SESSION",
    "HERDR",
    "GEN",
    "RESULT",
    "CR",
    "AGE",
  ]);
  assert.deepEqual(columns("ChangeRequest"), ["NAME", "CHANGE", "PHASE", "COND", "SYNC", "AGE"]);
  assert.deepEqual(columns("TaskConfig"), ["NAME", "PHASE", "COND", "SYNC", "AGE"]);
});

test("Tasks that need a person come first, then open work, then settled, newest first", () => {
  assert.deepEqual(
    taskRows().map((r) => [r.marker, r.name]),
    [
      ["?", "layout-worker"],
      ["!", "stuck-worker"],
      [null, "busy-worker"],
      [null, "mission-control"],
      [null, "shipped-worker"],
      [null, "orphan"],
    ],
  );
  assert.equal(needYou(taskRows()), 2);
});

test("the marker says why: attention wins, else the first open Question's first line", () => {
  assert.equal(row("stuck-worker").why, "DeliveryUnconfirmed: inbox entry could not be confirmed");
  assert.equal(row("layout-worker").why, "q2: Pick a name?");
  assert.equal(row("busy-worker").why, null);
});

test("a Task row carries its state, session, generation, result and change requests", () => {
  const shipped = row("shipped-worker");
  assert.deepEqual(cell(shipped, "PHASE"), { text: "Concluded", tone: "ok" });
  assert.deepEqual(cell(shipped, "SESSION"), { text: "Idle", tone: "muted" });
  assert.deepEqual(cell(shipped, "HERDR"), { text: "idle", tone: "idle" });
  assert.deepEqual(cell(shipped, "GEN"), { text: "2/2", tone: null });
  assert.deepEqual(cell(shipped, "RESULT"), { text: "shipped", tone: "ok" });
  assert.deepEqual(cell(shipped, "CR"), { text: "1", tone: null });
  assert.deepEqual(cell(shipped, "AGE"), { text: "7m", tone: null });
  assert.equal(shipped.terminal, "t4");
  const busy = row("busy-worker");
  assert.deepEqual(cell(busy, "SESSION"), { text: "Paused", tone: "muted" });
  assert.deepEqual(cell(busy, "HERDR"), { text: "paused", tone: "muted" });
  assert.deepEqual(cell(row("stuck-worker"), "GEN"), { text: "1/2", tone: "bad" });
  const remote = structuredClone(task("mission-control"));
  remote.status.session.host = "mux/nixos-hp";
  assert.deepEqual(cell(rows("Task", [remote], { now })[0], "SESSION"), {
    text: "mux/nixos-hp Running",
    tone: null,
  });
  assert.deepEqual(cell(row("layout-worker"), "HERDR"), { text: "blocked", tone: "blocked" });
  assert.deepEqual(cell(row("stuck-worker"), "NAME"), { text: "stuck-worker", tone: "bad" });
});

test("a Task links its TaskConfig, what it declared, its parent and its children", () => {
  assert.deepEqual(relations("Task", task("shipped-worker"), tasks), [
    { kind: "TaskConfig", name: "default-claude" },
    { kind: "ChangeRequest", name: "cr-2" },
    { kind: "Task", name: "mission-control", role: "parent" },
  ]);
  const children = relations("Task", task("mission-control"), tasks).map((r) => r.name);
  assert.deepEqual(children.sort(), [
    "busy-worker",
    "layout-worker",
    "shipped-worker",
    "stuck-worker",
  ]);
});

test("a TaskConfig links its EnvProviders, skipping empty names", () => {
  assert.deepEqual(relations("TaskConfig", others.TaskConfig[0], []), [
    { kind: "EnvProvider", name: "github-token" },
  ]);
});

test("other kinds show conditions and whether status caught up with spec", () => {
  const [config] = rows("TaskConfig", others.TaskConfig, { now });
  assert.deepEqual(
    config.cells.map((c) => c.text),
    ["default-claude", "-", "●○", "±", "8m"],
  );
  assert.equal(config.cells[3].tone, "warn");
  const crs = rows("ChangeRequest", others.ChangeRequest, { now });
  assert.deepEqual(
    crs.map((r) => [r.name, r.cells[1].text, r.cells[2].text, r.cells[4].text]),
    [
      ["cr-3", "grp/sub/proj!3", "Open", "✓"],
      ["cr-2", "acme/app#22", "Settled", "✓"],
    ],
  );
});

test("an empty or missing list builds no rows", () => {
  assert.deepEqual(rows("Task", undefined, { now }), []);
});

test("rows are split into needs-you, open and settled sections with counts", () => {
  const items = withSections(taskRows());
  assert.deepEqual(
    items.map((i) => (i.type === "section" ? `${i.key}:${i.count}` : i.index)),
    ["needs:2", 0, 1, "open:2", 2, 3, "settled:2", 4, 5],
  );
  assert.equal(itemIndex(items, 2), 4);
  assert.deepEqual(withSections([]), []);
});

test("the filter matches name and request, ignoring case", () => {
  const names = (q) => filterRows(taskRows(), q).map((r) => r.name);
  assert.deepEqual(names("WORKER").length, 4);
  assert.deepEqual(names("herdr layout"), ["layout-worker"]);
  assert.deepEqual(
    names(""),
    taskRows().map((r) => r.name),
  );
  assert.deepEqual(names("nothing-like-this"), []);
});

test("a row's link to open is its change, else its first web artifact or change request", () => {
  assert.equal(primaryUrl(row("shipped-worker")), "https://github.com/acme/app/pull/22");
  assert.equal(primaryUrl(row("stuck-worker")), "https://github.com/acme/app/pull/7");
  assert.equal(primaryUrl(row("busy-worker")), null);
  const [cr] = rows("ChangeRequest", others.ChangeRequest, { now });
  assert.equal(primaryUrl(cr), "https://gitlab.com/grp/sub/proj/-/merge_requests/3");
});

test("the preview of a Task leads with what needs you, then what it is and what it did", () => {
  const titles = (name) => preview(row(name)).map((s) => s.title);
  assert.deepEqual(titles("layout-worker"), ["Open questions", "Request", "Answered"]);
  assert.deepEqual(titles("stuck-worker"), ["Needs attention", "Change requests"]);
  assert.deepEqual(titles("shipped-worker"), ["Result", "Change requests", "Answered"]);
  const questions = preview(row("layout-worker"))[0];
  assert.deepEqual(questions.items, [{ label: "q2", text: "Pick a name?" }]);
  const result = preview(row("shipped-worker"))[0];
  assert.equal(result.tone, "ok");
  assert.deepEqual(result.items, [
    { text: "Draft PR #22 adds the installer." },
    { text: "acme/app#22", url: "https://github.com/acme/app/pull/22" },
  ]);
});

test("the preview of another kind lists its conditions with their reasons", () => {
  const [config] = rows("TaskConfig", others.TaskConfig, { now });
  assert.deepEqual(preview(config), [
    {
      title: "Conditions",
      tone: null,
      items: [
        { label: "●", text: "Ready" },
        { label: "○", text: "Valid" },
      ],
    },
  ]);
});

test("a Task's routine conditions stay out of its preview", () => {
  const open = structuredClone(task("busy-worker"));
  open.status.conditions = [{ type: "Concluded", status: "False", reason: "NoResultYet" }];
  const [r] = rows("Task", [open], { now });
  assert.deepEqual(preview(r), []);
});
