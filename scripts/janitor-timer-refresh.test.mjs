// Lane 74 item 6: install of the new release re-registers an already-registered janitor timer.
// Sealed fake home, fake plugin roots, platform and exec injected: no systemctl, schtasks or launchctl
// is ever called, and nothing outside the sealed home is read or written.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { makeTempHome } from "./test-home.mjs";
import { main as install } from "./install-janitor-timer.mjs";
import { refreshIfRegistered, bakedRootFromUnit } from "./janitor-timer-refresh.mjs";

const th = makeTempHome();
after(() => th.cleanup());
let n = 0;

function fixture(platform) {
  const base = path.join(th.fixtureRoot, `refresh-${n++}`);
  const home = path.join(base, "home");
  const repo = path.join(base, "repo");
  fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
  const roots = {};
  for (const v of ["old", "new"]) {
    roots[v] = path.join(base, `plugin-${v}`);
    fs.mkdirSync(path.join(roots[v], "scripts"), { recursive: true });
    fs.writeFileSync(path.join(roots[v], "scripts", "janitor.mjs"), "// fixture\n");
  }
  fs.mkdirSync(home, { recursive: true });
  const calls = [];
  const exec = (cmd, args) => { calls.push([cmd, ...args].join(" ")); };
  const env = { XDG_CONFIG_HOME: path.join(home, ".config") };
  const common = { home, platform, env, exec, stdout: () => {} };
  const register = (root) => install(["--repo", repo, "--hour", "7", "--host", "fixture-host", "--force-root", "--enable"], { ...common, pluginRoot: root });
  return { home, repo, roots, calls, env, exec, platform, register };
}

const unitFile = (f) => path.join(f.env.XDG_CONFIG_HOME, "systemd", "user", "janitor-record.service");
const unitOf = (f) => fs.readFileSync(unitFile(f), "utf8");
const refresh = (f, extra = {}) => refreshIfRegistered({ home: f.home, pluginRoot: f.roots.new, env: f.env, platform: f.platform, exec: f.exec, forceRoot: true, ...extra });

describe("refreshIfRegistered", () => {
  test("never installs a timer that was never installed", () => {
    const f = fixture("linux");
    const r = refresh(f);
    assert.equal(r.action, "none");
    assert.equal(fs.existsSync(path.join(f.home, ".agents")), false, "nothing written");
    assert.deepEqual(f.calls, []);
  });

  test("a registered timer pointing at an older release is re-registered from this one, repo hour and host kept", () => {
    const f = fixture("linux");
    assert.equal(f.register(f.roots.old), 0);
    assert.ok(unitOf(f).includes("plugin-old"));
    f.calls.length = 0;
    const r = refresh(f);
    assert.equal(r.action, "refreshed", r.reason);
    const text = unitOf(f);
    assert.ok(text.includes("plugin-new"), "unit now bakes the new root");
    assert.ok(!text.includes("plugin-old"), "old root gone");
    assert.match(text, /--host fixture-host/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.home, ".agents", "janitor", "installed.json"), "utf8")).hour, 7);
    assert.ok(f.calls.length > 0 && f.calls.every((c) => c.startsWith("systemctl --user")), "scheduler reloaded through the injected exec only");
  });

  test("already on this release: current, no scheduler call", () => {
    const f = fixture("linux");
    f.register(f.roots.new);
    f.calls.length = 0;
    const r = refresh(f);
    assert.equal(r.action, "current");
    assert.deepEqual(f.calls, []);
  });

  test("registered but the unit file is gone: nothing is installed", () => {
    const f = fixture("linux");
    f.register(f.roots.old);
    fs.unlinkSync(unitFile(f));
    f.calls.length = 0;
    const r = refresh(f);
    assert.equal(r.action, "none");
    assert.deepEqual(f.calls, []);
    assert.equal(fs.existsSync(unitFile(f)), false);
  });

  test("a root that is not an installed plugin location is refused by the installer and the old unit is left alone", () => {
    const f = fixture("linux");
    f.register(f.roots.old);
    const before = unitOf(f);
    f.calls.length = 0;
    const r = refresh(f, { forceRoot: false });
    assert.equal(r.action, "refused");
    assert.equal(unitOf(f), before);
    assert.deepEqual(f.calls, []);
  });

  test("windows task xml (utf-16, quoted argv) is read for its baked root and re-registered", () => {
    const f = fixture("win32");
    assert.equal(f.register(f.roots.old), 0);
    const xml = path.join(f.home, ".agents", "janitor", "janitor-record.task.xml");
    assert.equal(path.resolve(bakedRootFromUnit(fs.readFileSync(xml).toString("utf16le"))), path.resolve(f.roots.old));
    f.calls.length = 0;
    const r = refresh(f);
    assert.equal(r.action, "refreshed", r.reason);
    assert.ok(f.calls.length > 0 && f.calls.every((c) => c.startsWith("schtasks")));
    assert.equal(path.resolve(bakedRootFromUnit(fs.readFileSync(xml).toString("utf16le"))), path.resolve(f.roots.new));
  });
});
