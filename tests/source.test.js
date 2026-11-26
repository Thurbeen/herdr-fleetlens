import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  listCommand,
  mergeKinds,
  openUrlCommand,
  PLUGINS,
  readKinds,
  readList,
  readPluginKinds,
  storeWatchDir,
  VERSION,
  withBin,
} from "../mods/fleet-lens/source.js";

const raw = readFileSync(new URL("./fixtures/tasks.json", import.meta.url), "utf8");
const version = readFileSync(new URL("./fixtures/version.json", import.meta.url), "utf8");

test("Fleet is read only through its public CLI, as JSON", () => {
  assert.deepEqual(VERSION, { command: "fleet", args: ["version", "--json"] });
  assert.deepEqual(listCommand("TaskConfig"), {
    command: "fleet",
    args: ["list", "TaskConfig", "--json"],
  });
});

test("the kinds and version come from fleet version, Tasks first", () => {
  assert.deepEqual(readKinds({ code: 0, stdout: version, stderr: "" }), {
    ok: true,
    version: "3.29.1",
    kinds: ["Task", "TaskConfig", "EnvProvider", "ChangeRequest", "Board"],
  });
  const shuffled = JSON.stringify({ version: "1", kinds: ["Board", "Task"] });
  assert.deepEqual(readKinds({ code: 0, stdout: shuffled, stderr: "" }).kinds, ["Task", "Board"]);
});

test("a list yields its objects, as an array or under items", () => {
  assert.equal(readList({ code: 0, stdout: raw, stderr: "" }).objects.length, 6);
  const wrapped = JSON.stringify({ items: JSON.parse(raw) });
  assert.equal(readList({ code: 0, stdout: wrapped, stderr: "" }).objects.length, 6);
});

test("a failing fleet call reports its whole stderr", () => {
  assert.deepEqual(readList({ code: 4, stdout: "", stderr: "error: store unreadable\nlock\n" }), {
    ok: false,
    error: "fleet exited 4: error: store unreadable\nlock",
  });
});

test("output that is not a list is an error, not an empty fleet", () => {
  assert.equal(readList({ code: 0, stdout: "not json", stderr: "" }).ok, false);
  assert.equal(readList({ code: 0, stdout: "{}", stderr: "" }).ok, false);
  assert.equal(readKinds({ code: 0, stdout: "{}", stderr: "" }).ok, false);
});

test("the change signal watches the store's objects", () => {
  assert.equal(storeWatchDir("/data/fleet/store-v1/"), "/data/fleet/store-v1/objects");
  assert.equal(storeWatchDir(undefined), null);
});

test("a link opens with the platform's own opener", () => {
  const url = "https://github.com/acme/app/pull/22";
  assert.deepEqual(openUrlCommand("linux", url), { command: "xdg-open", args: [url] });
  assert.deepEqual(openUrlCommand("macos", url), { command: "open", args: [url] });
  assert.deepEqual(openUrlCommand("windows", url), {
    command: "cmd",
    args: ["/c", "start", "", url],
  });
  assert.equal(openUrlCommand("linux", "file:///etc/passwd"), null);
});

test("custom kinds come from the plugins fleet serves, after the core kinds", () => {
  assert.deepEqual(PLUGINS, { command: "fleet", args: ["list", "plugins", "--json"] });
  const plugins = JSON.stringify([
    { name: "fleet-factory", available: true, kinds: ["TicketSource", "Ticket"] },
    { name: "fleet-reviewer", available: true, kinds: ["ReviewSource", "Review"] },
    { name: "gone", available: false, kinds: ["Ghost"] },
  ]);
  assert.deepEqual(readPluginKinds({ code: 0, stdout: plugins, stderr: "" }), {
    ok: true,
    kinds: ["TicketSource", "Ticket", "ReviewSource", "Review"],
  });
  assert.deepEqual(readPluginKinds({ code: 0, stdout: '{"plugins":[]}', stderr: "" }).kinds, []);
  assert.equal(readPluginKinds({ code: 2, stdout: "", stderr: "boom" }).ok, false);
  assert.deepEqual(mergeKinds(["Task", "Board"], ["Review", "Board", "Ticket"]), [
    "Task",
    "Board",
    "Review",
    "Ticket",
  ]);
});

test("a configured fleet binary replaces fleet in every command", () => {
  assert.deepEqual(withBin(listCommand("Task"), "/opt/fleet"), {
    command: "/opt/fleet",
    args: ["list", "Task", "--json"],
  });
  assert.deepEqual(withBin(VERSION, undefined), VERSION);
  assert.deepEqual(withBin(PLUGINS, ""), PLUGINS);
});
