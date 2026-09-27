// node --test scripts/install-janitor-timer.test.mjs
//
// Every fixture home here is a plain fs.mkdtempSync'd directory under os.tmpdir() (or FIXTURE_ROOT
// under the sealed run, same fallback pattern scripts/janitor.test.mjs's mkTmp uses) — never the
// real `~`. main() is called in-process with an injected `home`, never a spawned child that reads
// process.env.HOME, so there is no risk of this file touching a real machine's home even under an
// unsealed run. `--enable` is exercised twice below, both times with an injected fake `exec` that
// only records the argv it would have run — no test here ever calls a real systemctl, schtasks or
// launchctl, and this file asserts that fact (no such binary needs to exist on this host for the
// suite to pass).
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  main,
  resolveRepo,
  scheduledCommandArgv,
  installedJsonText,
  systemdServiceUnit,
  systemdTimerUnit,
  windowsTaskXml,
  launchdPlist,
} from "./install-janitor-timer.mjs";

const tracked = [];
function mkTmp(prefix) {
  const dir = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), prefix));
  tracked.push(dir);
  return dir;
}

function capture() {
  const lines = [];
  return { stdout: (s) => lines.push(s), text: () => lines.join("") };
}

/** A fixture "installed plugin" checkout. Every fixture in this file lives under os.tmpdir() (or
 * the sealed run's FIXTURE_ROOT, itself under os.tmpdir()) — isDurablePath flags ANY path starting
 * under the system temp dir as non-durable BY DESIGN (that is the whole point of the check), so
 * every test below that wants a real, non-refused install passes --force-root explicitly, exactly
 * as the brief specifies ("--force-root is allowed only in tests"). The refusal itself, with no
 * --force-root, is covered by its own dedicated test using the installer's default pluginRoot
 * (this build's own worktree). */
function fixturePluginRoot() {
  const dir = mkTmp("janitor-timer-plugin-");
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  return dir;
}

test("byte-stability: every generator is a pure function of its inputs — called twice, identical bytes", () => {
  const inputs = {
    node: "/usr/bin/node", pluginRoot: "/opt/plugin", repo: "/home/x/Code/claude-delegation",
    host: "hostA", hour: 6, logPath: "/home/x/.agents/janitor/last-run.log", name: "janitor-record",
    label: "com.delegation.janitor-record",
  };
  assert.equal(systemdServiceUnit(inputs), systemdServiceUnit(inputs));
  assert.equal(systemdTimerUnit(inputs), systemdTimerUnit(inputs));
  assert.equal(windowsTaskXml(inputs), windowsTaskXml(inputs));
  assert.equal(launchdPlist(inputs), launchdPlist(inputs));
  assert.equal(installedJsonText({ ...inputs, scheduler: "systemd-user" }), installedJsonText({ ...inputs, scheduler: "systemd-user" }));
});

test("--apply never appears in any generated text, for any of the three schedulers", () => {
  const inputs = {
    node: "/usr/bin/node", pluginRoot: "/opt/plugin", repo: "/home/x/Code/claude-delegation",
    host: "hostA", hour: 6, logPath: "/home/x/.agents/janitor/last-run.log", name: "janitor-record",
    label: "com.delegation.janitor-record",
  };
  for (const text of [
    systemdServiceUnit(inputs), systemdTimerUnit(inputs), windowsTaskXml(inputs), launchdPlist(inputs),
    installedJsonText({ ...inputs, scheduler: "systemd-user" }),
    scheduledCommandArgv(inputs).join(" "),
  ]) {
    assert.ok(!text.includes("--apply"), `must never contain --apply: ${text}`);
  }
});

test("scheduledCommandArgv is exactly <node> <pluginRoot>/scripts/janitor.mjs --record --repo <repo>, plus --host when given", () => {
  const base = scheduledCommandArgv({ node: "/n/node", pluginRoot: "/p", repo: "/r" });
  assert.deepEqual(base, ["/n/node", path.join("/p", "scripts", "janitor.mjs"), "--record", "--repo", "/r"]);
  const withHost = scheduledCommandArgv({ node: "/n/node", pluginRoot: "/p", repo: "/r", host: "netcup" });
  assert.deepEqual(withHost, ["/n/node", path.join("/p", "scripts", "janitor.mjs"), "--record", "--repo", "/r", "--host", "netcup"]);
});

test("installed.json is byte-stable and matches the pinned seam shape exactly (key order included)", () => {
  const text = installedJsonText({ repo: "/r", node: "/n", hour: 6, scheduler: "systemd-user", name: "janitor-record" });
  assert.equal(text, '{"schema":1,"repo":"/r","node":"/n","hour":6,"scheduler":"systemd-user","name":"janitor-record"}\n');
});

test("resolveRepo: --repo overrides everything; else ~/.agents/janitor-repo if present; else ~/Code/claude-delegation", () => {
  const home = mkTmp("janitor-timer-repo-home-");
  assert.equal(resolveRepo({ home, repoFlag: "/explicit/repo" }), path.resolve("/explicit/repo"));
  assert.equal(resolveRepo({ home, repoFlag: null }), path.join(home, "Code", "claude-delegation"));

  fs.mkdirSync(path.join(home, ".agents"), { recursive: true });
  fs.writeFileSync(path.join(home, ".agents", "janitor-repo"), "/from/override/file\n");
  assert.equal(resolveRepo({ home, repoFlag: null }), path.resolve("/from/override/file"));
  // --repo still wins even when the override file exists.
  assert.equal(resolveRepo({ home, repoFlag: "/explicit/repo" }), path.resolve("/explicit/repo"));
});

test("refuses to install from a temporary/worktree checkout unless --force-root, and writes nothing when refused", () => {
  const home = mkTmp("janitor-timer-home-refuse-");
  const cap = capture();
  // Default pluginRoot (no override) resolves to THIS test file's own worktree root, which sits
  // under a `wt-...` segment — exactly the case isDurablePath is documented to flag (scout-J1.md).
  const code = main(["--json"], { home, ...cap });
  assert.equal(code, 1);
  const result = JSON.parse(cap.text());
  assert.ok(result.refusals.length > 0, "must refuse from a temporary checkout");
  assert.match(result.refusals[0], /temporary checkout/);
  assert.ok(!fs.existsSync(path.join(home, ".agents", "janitor")), "a refused install must write nothing at all");
});

test("--force-root (tests only) bypasses the checkout-durability refusal", () => {
  const home = mkTmp("janitor-timer-home-force-");
  const cap = capture();
  const code = main(["--force-root", "--json"], { home, platform: "linux", execPath: "/usr/bin/node", ...cap });
  assert.equal(code, 0);
  const result = JSON.parse(cap.text());
  assert.equal(result.refusals.length, 0);
});

test("--remove is never gated by the checkout-durability check (only install creates a new reference)", () => {
  const home = mkTmp("janitor-timer-home-remove-nogate-");
  const cap = capture();
  const code = main(["--remove", "--json"], { home, platform: "linux", ...cap });
  assert.equal(code, 0, "a --remove from a non-durable checkout must still be allowed to run");
  const result = JSON.parse(cap.text());
  assert.equal(result.refusals.length, 0);
});

test("a real install (fixture plugin root) writes the systemd unit+timer and installed.json, idempotently", () => {
  const home = mkTmp("janitor-timer-home-linux-");
  const pluginRoot = fixturePluginRoot();
  const env = { XDG_CONFIG_HOME: path.join(home, ".config") };

  const cap1 = capture();
  const code1 = main(["--force-root", "--json", "--host", "test-host"], { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, ...cap1 });
  assert.equal(code1, 0);
  const r1 = JSON.parse(cap1.text());
  assert.equal(r1.scheduler, "systemd-user");

  const unitDir = path.join(home, ".config", "systemd", "user");
  const serviceFile = path.join(unitDir, "janitor-record.service");
  const timerFile = path.join(unitDir, "janitor-record.timer");
  assert.ok(fs.existsSync(serviceFile));
  assert.ok(fs.existsSync(timerFile));

  const serviceText = fs.readFileSync(serviceFile, "utf8");
  assert.match(serviceText, /^# generated by delegation install-janitor-timer\n/);
  assert.ok(serviceText.includes("WorkingDirectory=" + path.join(home, "Code", "claude-delegation")));
  assert.ok(serviceText.includes("Environment=PATH=/usr/bin:/usr/bin:/bin"));
  assert.ok(serviceText.includes("ExecStart=/usr/bin/node " + path.join(pluginRoot, "scripts", "janitor.mjs") + " --record --repo " + path.join(home, "Code", "claude-delegation") + " --host test-host"));
  assert.ok(serviceText.includes("StandardOutput=truncate:" + path.join(home, ".agents", "janitor", "last-run.log")));
  assert.ok(!serviceText.includes("--apply"));

  const timerText = fs.readFileSync(timerFile, "utf8");
  assert.match(timerText, /OnCalendar=\*-\*-\* 06:00:00/);
  assert.match(timerText, /Persistent=true/);

  const installedPath = path.join(home, ".agents", "janitor", "installed.json");
  assert.ok(fs.existsSync(installedPath));
  const installed = JSON.parse(fs.readFileSync(installedPath, "utf8"));
  assert.deepEqual(installed, {
    schema: 1,
    repo: path.join(home, "Code", "claude-delegation"),
    node: "/usr/bin/node",
    hour: 6,
    scheduler: "systemd-user",
    name: "janitor-record",
  });

  // Idempotent: a second install with the SAME inputs changes nothing.
  const cap2 = capture();
  main(["--force-root", "--json", "--host", "test-host"], { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, ...cap2 });
  const r2 = JSON.parse(cap2.text());
  for (const f of r2.files) assert.equal(f.status, "unchanged", `expected unchanged, got ${f.status} for ${f.path}`);
  assert.equal(fs.readFileSync(serviceFile, "utf8"), serviceText, "a second install must not rewrite identical bytes");
});

test("--dry-run writes nothing at all, even the containing directory, but still reports the generated content", () => {
  const home = mkTmp("janitor-timer-home-dryrun-");
  const pluginRoot = fixturePluginRoot();
  const cap = capture();
  const code = main(["--force-root", "--dry-run", "--json"], { home, platform: "linux", execPath: "/usr/bin/node", pluginRoot, ...cap });
  assert.equal(code, 0);
  const result = JSON.parse(cap.text());
  assert.equal(result.action, "dry-run");
  assert.ok(!fs.existsSync(path.join(home, ".agents")), "--dry-run must not create ANY directory, not even .agents");
  assert.ok(result.files.length >= 2);
  for (const f of result.files) {
    assert.ok(typeof f.content === "string" && f.content.length > 0, "a dry-run result must still quote the generated content");
    assert.ok(!f.content.includes("--apply"));
  }
});

test("--remove deletes only the files it made (marker-checked) and leaves a same-named foreign file alone", () => {
  const home = mkTmp("janitor-timer-home-remove-");
  const pluginRoot = fixturePluginRoot();
  const env = { XDG_CONFIG_HOME: path.join(home, ".config") };

  main(["--force-root", "--json"], { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, ...capture() });

  const unitDir = path.join(home, ".config", "systemd", "user");
  const serviceFile = path.join(unitDir, "janitor-record.service");
  const timerFile = path.join(unitDir, "janitor-record.timer");
  const installedPath = path.join(home, ".agents", "janitor", "installed.json");
  assert.ok(fs.existsSync(serviceFile) && fs.existsSync(timerFile) && fs.existsSync(installedPath));

  // A user's OWN unrelated janitor-record.timer-shaped... no: same exact name, no marker — this is
  // the reviewer attack brief's named case ("--remove deleting a user's unrelated janitor* unit").
  // Overwrite the marked timer file with foreign content to simulate this directly.
  fs.writeFileSync(timerFile, "[Timer]\nOnCalendar=hourly\n");

  const cap = capture();
  const code = main(["--remove", "--json"], { home, env, platform: "linux", pluginRoot, ...cap });
  assert.equal(code, 0);
  const result = JSON.parse(cap.text());

  assert.ok(!fs.existsSync(serviceFile), "our own marked service unit must be removed");
  assert.ok(fs.existsSync(timerFile), "a same-named file WITHOUT our marker must be left untouched");
  assert.equal(fs.readFileSync(timerFile, "utf8"), "[Timer]\nOnCalendar=hourly\n");
  assert.ok(!fs.existsSync(installedPath), "installed.json is entirely ours and must be removed");

  const timerResult = result.files.find((f) => f.path === timerFile);
  assert.equal(timerResult.status, "left-untouched-foreign");
  const serviceResult = result.files.find((f) => f.path === serviceFile);
  assert.equal(serviceResult.status, "removed");
});

test("--remove on a host where nothing was ever installed reports absent, not an error", () => {
  const home = mkTmp("janitor-timer-home-remove-absent-");
  const cap = capture();
  const code = main(["--remove", "--json"], { home, platform: "linux", ...cap });
  assert.equal(code, 0);
  const result = JSON.parse(cap.text());
  for (const f of result.files) assert.equal(f.status, "absent");
});

test("--hour sets the systemd OnCalendar hour and installed.json's hour field; an out-of-range value falls back to the default", () => {
  const home = mkTmp("janitor-timer-home-hour-");
  const pluginRoot = fixturePluginRoot();
  const env = { XDG_CONFIG_HOME: path.join(home, ".config") };
  main(["--force-root", "--json", "--hour", "14"], { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, ...capture() });
  const timerText = fs.readFileSync(path.join(home, ".config", "systemd", "user", "janitor-record.timer"), "utf8");
  assert.match(timerText, /OnCalendar=\*-\*-\* 14:00:00/);
  const installed = JSON.parse(fs.readFileSync(path.join(home, ".agents", "janitor", "installed.json"), "utf8"));
  assert.equal(installed.hour, 14);

  const home2 = mkTmp("janitor-timer-home-hour-bad-");
  const pluginRoot2 = fixturePluginRoot();
  const env2 = { XDG_CONFIG_HOME: path.join(home2, ".config") };
  main(["--force-root", "--json", "--hour", "99"], { home: home2, env: env2, platform: "linux", execPath: "/usr/bin/node", pluginRoot: pluginRoot2, ...capture() });
  const installed2 = JSON.parse(fs.readFileSync(path.join(home2, ".agents", "janitor", "installed.json"), "utf8"));
  assert.equal(installed2.hour, 6, "an out-of-range --hour must fall back to the default (6), never write a bad value");
});

test("--enable runs the platform's own enable command through the injected exec, never spawning a real one — and is skipped entirely under --dry-run", () => {
  const home = mkTmp("janitor-timer-home-enable-");
  const pluginRoot = fixturePluginRoot();
  const env = { XDG_CONFIG_HOME: path.join(home, ".config") };
  const calls = [];
  const fakeExec = (cmd, args) => { calls.push([cmd, ...args].join(" ")); return ""; };

  main(["--force-root", "--json", "--enable"], { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, exec: fakeExec, ...capture() });
  assert.ok(calls.some((c) => c === "systemctl --user daemon-reload"));
  assert.ok(calls.some((c) => c === "systemctl --user enable --now janitor-record.timer"));

  calls.length = 0;
  const home2 = mkTmp("janitor-timer-home-enable-dryrun-");
  const pluginRoot2 = fixturePluginRoot();
  main(["--force-root", "--json", "--enable", "--dry-run"], { home: home2, platform: "linux", execPath: "/usr/bin/node", pluginRoot: pluginRoot2, exec: fakeExec, ...capture() });
  assert.equal(calls.length, 0, "--enable must never shell out under --dry-run");
});

test("windows and macos generation (text-only; schtasks/launchctl are never executed on this host)", () => {
  const home = mkTmp("janitor-timer-home-win-");
  const pluginRoot = fixturePluginRoot();
  const cap = capture();
  const code = main(["--force-root", "--json", "--name", "janitor-record-test"], {
    home, platform: "win32", execPath: "C:\\node\\node.exe", pluginRoot, ...cap,
  });
  assert.equal(code, 0);
  const result = JSON.parse(cap.text());
  assert.equal(result.scheduler, "schtasks");
  const xmlPath = path.join(home, ".agents", "janitor", "janitor-record-test.task.xml");
  assert.ok(fs.existsSync(xmlPath));
  const xml = fs.readFileSync(xmlPath, "utf8");
  assert.ok(xml.includes("<!-- generated by delegation install-janitor-timer -->"));
  assert.ok(!xml.includes("--apply"));
  assert.ok(xml.includes("--record"));

  const homeMac = mkTmp("janitor-timer-home-mac-");
  const pluginRootMac = fixturePluginRoot();
  const capMac = capture();
  main(["--force-root", "--json"], { home: homeMac, platform: "darwin", execPath: "/usr/local/bin/node", pluginRoot: pluginRootMac, ...capMac });
  const resultMac = JSON.parse(capMac.text());
  assert.equal(resultMac.scheduler, "launchd");
  const plistPath = path.join(homeMac, "Library", "LaunchAgents", "com.delegation.janitor-record.plist");
  assert.ok(fs.existsSync(plistPath));
  const plist = fs.readFileSync(plistPath, "utf8");
  assert.ok(plist.includes("com.delegation.janitor-record"));
  assert.ok(!plist.includes("--apply"));
});

after(() => {
  for (const dir of tracked) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort cleanup of this file's own fixtures */ }
  }
});
