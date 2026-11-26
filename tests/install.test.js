import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const repo = new URL("..", import.meta.url).pathname;
const home = mkdtempSync(join(tmpdir(), "herdr-fleet-home-"));
const mod = join(home, "mods", "fleet-lens");
after(() => rmSync(home, { recursive: true, force: true }));

const install = (...args) =>
  spawnSync(join(repo, "install.sh"), args, {
    encoding: "utf8",
    env: { ...process.env, HERDR_APP_HOME: join(home, "unused") },
  });

test("install copies the Lens into the given home and records the store", () => {
  const run = install("--home", home, "--store", "/data/fleet/store-v1");
  assert.equal(run.status, 0, run.stderr);
  for (const file of [
    "main.js",
    "model.js",
    "source.js",
    "sessions.js",
    "sidebar.js",
    "yaml.js",
    "view.js",
    "mod.json",
    "thurbeen-mark.png",
    "thurbeen-emblem.png",
  ]) {
    assert.ok(existsSync(join(mod, file)), file);
  }
  assert.deepEqual(JSON.parse(readFileSync(join(mod, "config.json"), "utf8")), {
    store: "/data/fleet/store-v1",
  });
  assert.ok(!existsSync(join(home, "unused")), "HERDR_APP_HOME must not win over --home");
});

test("the Lens opens as a 92% by 90% float from the palette", () => {
  const manifest = JSON.parse(readFileSync(join(mod, "mod.json"), "utf8"));
  assert.deepEqual(manifest.overlay, { kind: "dialog", width: 0.92, height: 0.9 });
  assert.deepEqual(manifest.palette[0].args, { name: "fleet-lens" });
});

const blocks = (node) => [node, ...(node.children ?? []).flatMap(blocks)];

test("the fleet layout swaps Herdr's agents list for Fleet sessions, keeping spaces", () => {
  const layout = JSON.parse(readFileSync(join(home, "layouts", "fleet.json"), "utf8"));
  const contents = blocks(layout)
    .map((n) => n.content)
    .filter(Boolean);
  const mods = contents.map((c) => c.mod).filter(Boolean);
  assert.ok(mods.includes("spaces"));
  assert.ok(!mods.includes("agents"));
  assert.ok(contents.some((c) => c.mod === "fleet-lens" && c.props?.view === "sessions"));
  assert.ok(contents.some((c) => c.tab === "active"));
  const ids = blocks(layout).map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("install records a fleet binary when given one", () => {
  const other = mkdtempSync(join(tmpdir(), "herdr-fleet-bin-"));
  try {
    const run = install("--home", other, "--bin", "/opt/fleet/bin/fleet");
    assert.equal(run.status, 0, run.stderr);
    const config = JSON.parse(
      readFileSync(join(other, "mods", "fleet-lens", "config.json"), "utf8"),
    );
    assert.deepEqual(config, { bin: "/opt/fleet/bin/fleet" });
  } finally {
    rmSync(other, { recursive: true, force: true });
  }
});

test("install refuses to run without --home", () => {
  const run = install();
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /--home/);
});

const hasHerdrApp = spawnSync("herdr-app", ["--version"]).status === 0;

test("herdr-app loads and renders the installed Lens", { skip: !hasHerdrApp }, () => {
  const out = execFileSync("herdr-app", ["check", mod], {
    encoding: "utf8",
    env: { ...process.env, HERDR_APP_HOME: home },
  });
  assert.match(out, /check passed/);
});
