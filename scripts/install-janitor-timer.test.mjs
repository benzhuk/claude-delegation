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

// J1 review round 1, M4: `path.resolve(execPath)` runs on whatever OS this SUITE itself executes on
// (node's own "path" module, not the `platform:` option passed to main()), so a literal
// "/usr/bin/node" string only matches the real ExecStart/PATH/installed.json output on POSIX. This
// resolves once, the same way main() does, so every assertion below stays correct on Windows too.
const NODE = path.resolve("/usr/bin/node");

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
  // J1 review round 1, M5: the installer now refuses when the janitor script it would schedule does
  // not exist, so every fixture plugin root needs a stub present.
  fs.writeFileSync(path.join(dir, "scripts", "janitor.mjs"), "// stub for install-janitor-timer tests\n");
  return dir;
}

/** J1 review round 1, M5: the installer now also refuses when the repo it would watch is not a git
 * checkout. Every test below that expects a successful (non-refused) install/dry-run using the
 * DEFAULT repo (no explicit --repo) must first create this, mirroring a real `git init`'s `.git/`. */
function fixtureDefaultRepoGit(home) {
  const dir = path.join(home, "Code", "claude-delegation");
  fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
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
  // J1 review round 1, B2: this must refuse regardless of where THIS test file's own checkout lives
  // (a durable `~/Code/claude-delegation` on main, or `C:\Users\ben\Code\claude-delegation` on
  // Windows, are both durable paths) — so pluginRoot is an explicit fixture under os.tmpdir(),
  // non-durable by construction, never the installer's own default.
  const code = main(["--json"], {
    home,
    env: { XDG_CONFIG_HOME: path.join(home, ".config") },
    platform: "linux",
    execPath: "/usr/bin/node",
    pluginRoot: fixturePluginRoot(),
    ...cap,
  });
  assert.equal(code, 1);
  const result = JSON.parse(cap.text());
  assert.ok(result.refusals.length > 0, "must refuse from a temporary checkout");
  assert.match(result.refusals[0], /temporary checkout/);
  assert.ok(!fs.existsSync(path.join(home, ".agents", "janitor")), "a refused install must write nothing at all");
});

test("--force-root (tests only) bypasses the checkout-durability refusal", () => {
  const home = mkTmp("janitor-timer-home-force-");
  fixtureDefaultRepoGit(home);
  const cap = capture();
  // J1 review round 1, m5: pass env explicitly (never fall through to a real process.env.
  // XDG_CONFIG_HOME) even though the sealed test runner already overrides it — this test's own
  // header claims safety under a bare, unsealed `node --test` too.
  const code = main(["--force-root", "--json"], {
    home,
    env: { XDG_CONFIG_HOME: path.join(home, ".config") },
    platform: "linux",
    execPath: "/usr/bin/node",
    ...cap,
  });
  assert.equal(code, 0);
  const result = JSON.parse(cap.text());
  assert.equal(result.refusals.length, 0);
});

test("--remove is never gated by the checkout-durability check (only install creates a new reference)", () => {
  const home = mkTmp("janitor-timer-home-remove-nogate-");
  const cap = capture();
  // J1 review round 1, m5: env passed explicitly, same reasoning as above.
  const code = main(["--remove", "--json"], { home, env: { XDG_CONFIG_HOME: path.join(home, ".config") }, platform: "linux", ...cap });
  assert.equal(code, 0, "a --remove from a non-durable checkout must still be allowed to run");
  const result = JSON.parse(cap.text());
  assert.equal(result.refusals.length, 0);
});

test("a real install (fixture plugin root) writes the systemd unit+timer and installed.json, idempotently", () => {
  const home = mkTmp("janitor-timer-home-linux-");
  fixtureDefaultRepoGit(home);
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

  const repo = path.join(home, "Code", "claude-delegation");
  const logPath = path.join(home, ".agents", "janitor", "last-run.log");
  const serviceText = fs.readFileSync(serviceFile, "utf8");
  // J1 review round 1, M4: compare against the SAME exported generator main() itself calls, rather
  // than a hand-reconstructed string — that stays correct however NODE/quoting resolve on this OS.
  assert.equal(serviceText, systemdServiceUnit({ node: NODE, pluginRoot, repo, host: "test-host", logPath }));
  assert.match(serviceText, /^# generated by delegation install-janitor-timer\n/);
  assert.ok(!serviceText.includes("--apply"));

  const timerText = fs.readFileSync(timerFile, "utf8");
  assert.match(timerText, /OnCalendar=\*-\*-\* 06:00:00/);
  assert.match(timerText, /Persistent=true/);

  const installedPath = path.join(home, ".agents", "janitor", "installed.json");
  assert.ok(fs.existsSync(installedPath));
  const installed = JSON.parse(fs.readFileSync(installedPath, "utf8"));
  assert.deepEqual(installed, {
    schema: 1,
    repo,
    node: NODE,
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
  fixtureDefaultRepoGit(home);
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
    // J1 review round 1, m4: a dry-run must say "would-create", never claim past tense for a file it
    // did not touch (nothing exists yet in this fixture home, so every artifact is a fresh create).
    assert.equal(f.status, "would-create", `expected would-create, got ${f.status} for ${f.path}`);
  }
});

test("--remove --dry-run reports would-remove, never claiming a file was removed when it was not", () => {
  const home = mkTmp("janitor-timer-home-remove-dryrun-");
  fixtureDefaultRepoGit(home);
  const pluginRoot = fixturePluginRoot();
  const env = { XDG_CONFIG_HOME: path.join(home, ".config") };
  main(["--force-root", "--json"], { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, ...capture() });

  const unitDir = path.join(home, ".config", "systemd", "user");
  const serviceFile = path.join(unitDir, "janitor-record.service");
  assert.ok(fs.existsSync(serviceFile));

  const cap = capture();
  const code = main(["--remove", "--dry-run", "--json"], { home, env, platform: "linux", pluginRoot, ...cap });
  assert.equal(code, 0);
  const result = JSON.parse(cap.text());
  const serviceResult = result.files.find((f) => f.path === serviceFile);
  assert.equal(serviceResult.status, "would-remove");
  assert.ok(fs.existsSync(serviceFile), "--remove --dry-run must not actually remove anything");
});

test("--remove deletes only the files it made (marker-checked) and leaves a same-named foreign file alone", () => {
  const home = mkTmp("janitor-timer-home-remove-");
  fixtureDefaultRepoGit(home);
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
  // J1 review round 1, m3: a plain --remove (no --enable) must say the live entry may remain.
  assert.match(result.note, /may still be registered\/running/);
});

test("--remove on a host where nothing was ever installed reports absent, not an error", () => {
  const home = mkTmp("janitor-timer-home-remove-absent-");
  const cap = capture();
  // J1 review round 1, m5: env passed explicitly, same reasoning as the other bare `main()` calls.
  const code = main(["--remove", "--json"], { home, env: { XDG_CONFIG_HOME: path.join(home, ".config") }, platform: "linux", ...cap });
  assert.equal(code, 0);
  const result = JSON.parse(cap.text());
  for (const f of result.files) assert.equal(f.status, "absent");
});

test("--hour sets the systemd OnCalendar hour and installed.json's hour field", () => {
  const home = mkTmp("janitor-timer-home-hour-");
  fixtureDefaultRepoGit(home);
  const pluginRoot = fixturePluginRoot();
  const env = { XDG_CONFIG_HOME: path.join(home, ".config") };
  main(["--force-root", "--json", "--hour", "14"], { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, ...capture() });
  const timerText = fs.readFileSync(path.join(home, ".config", "systemd", "user", "janitor-record.timer"), "utf8");
  assert.match(timerText, /OnCalendar=\*-\*-\* 14:00:00/);
  const installed = JSON.parse(fs.readFileSync(path.join(home, ".agents", "janitor", "installed.json"), "utf8"));
  assert.equal(installed.hour, 14);
});

test("--hour out of range (or non-integer) refuses outright and writes nothing, rather than silently falling back", () => {
  // J1 review round 1, m2: a typo'd --hour used to install a silent 06:00 timer and report success.
  for (const bad of ["99", "7.5", "-1", "nope"]) {
    const home = mkTmp("janitor-timer-home-hour-bad-");
    fixtureDefaultRepoGit(home);
    const pluginRoot = fixturePluginRoot();
    const env = { XDG_CONFIG_HOME: path.join(home, ".config") };
    const cap = capture();
    const code = main(["--force-root", "--json", "--hour", bad], { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, ...cap });
    assert.equal(code, 1, `--hour ${bad} must be refused`);
    const result = JSON.parse(cap.text());
    assert.ok(result.refusals.some((r) => r.includes("--hour must be an integer 0-23")), `expected an --hour refusal for ${bad}, got ${JSON.stringify(result.refusals)}`);
    assert.ok(!fs.existsSync(path.join(home, ".agents")), `--hour ${bad} must write nothing at all`);
  }
});

test("--enable runs the platform's own enable command through the injected exec, never spawning a real one — and is skipped entirely under --dry-run", () => {
  const home = mkTmp("janitor-timer-home-enable-");
  fixtureDefaultRepoGit(home);
  const pluginRoot = fixturePluginRoot();
  const env = { XDG_CONFIG_HOME: path.join(home, ".config") };
  const calls = [];
  const fakeExec = (cmd, args) => { calls.push([cmd, ...args].join(" ")); return ""; };

  const cap1 = capture();
  const code1 = main(["--force-root", "--json", "--enable"], { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, exec: fakeExec, ...cap1 });
  assert.equal(code1, 0);
  assert.ok(calls.some((c) => c === "systemctl --user daemon-reload"));
  assert.ok(calls.some((c) => c === "systemctl --user enable --now janitor-record.timer"));
  // J1 review round 1, m3: the contract says --enable "runs the host's enable/load command and
  // prints it" — assert it actually reaches the JSON result, not just the injected fakeExec.
  const r1 = JSON.parse(cap1.text());
  assert.ok(r1.commands.includes("systemctl --user daemon-reload"));
  assert.ok(r1.commands.includes("systemctl --user enable --now janitor-record.timer"));

  calls.length = 0;
  const home2 = mkTmp("janitor-timer-home-enable-dryrun-");
  fixtureDefaultRepoGit(home2);
  const pluginRoot2 = fixturePluginRoot();
  main(["--force-root", "--json", "--enable", "--dry-run"], { home: home2, platform: "linux", execPath: "/usr/bin/node", pluginRoot: pluginRoot2, exec: fakeExec, ...capture() });
  assert.equal(calls.length, 0, "--enable must never shell out under --dry-run");
});

test("J1 review round 1, M1: a foreign (unmarked) same-named unit blocks --enable entirely, on both install and --remove — zero exec calls, the user's unit left alone", () => {
  const home = mkTmp("janitor-timer-home-m1-");
  fixtureDefaultRepoGit(home);
  const pluginRoot = fixturePluginRoot();
  const env = { XDG_CONFIG_HOME: path.join(home, ".config") };
  const calls = [];
  const fakeExec = (cmd, args) => { calls.push([cmd, ...args].join(" ")); return ""; };

  // Plant a foreign (no marker) janitor-record.timer BEFORE any install — simulates the user's own
  // unrelated timer with the exact same name (the reviewer's attack-brief case, reached differently).
  const unitDir = path.join(home, ".config", "systemd", "user");
  fs.mkdirSync(unitDir, { recursive: true });
  const timerFile = path.join(unitDir, "janitor-record.timer");
  fs.writeFileSync(timerFile, "[Timer]\nOnCalendar=hourly\n");

  // install --enable: refuses overall (exit 1, never calls enable), and never touches the foreign
  // timer — the NON-conflicting service file is still safely written by name (planWrite never
  // overwrites a foreign file; only the finishing steps, installed.json + the by-name enable
  // command, are withheld), but installed.json itself must not appear: an incomplete install must
  // never look `created`/exit 0 to J2.
  const capInstall = capture();
  const codeInstall = main(["--force-root", "--json", "--enable"], { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, exec: fakeExec, ...capInstall });
  assert.equal(codeInstall, 1);
  assert.equal(calls.length, 0, "install --enable must record zero exec calls when a foreign unit is present");
  assert.equal(fs.readFileSync(timerFile, "utf8"), "[Timer]\nOnCalendar=hourly\n", "the user's own timer must be left byte-identical");
  const installedPath = path.join(home, ".agents", "janitor", "installed.json");
  assert.ok(!fs.existsSync(installedPath), "installed.json must not be written when an artifact is foreign");

  // --remove --enable against the same foreign file: also refuses outright, zero exec calls.
  const capRemove = capture();
  const codeRemove = main(["--remove", "--json", "--enable"], { home, env, platform: "linux", pluginRoot, exec: fakeExec, ...capRemove });
  assert.equal(codeRemove, 1);
  assert.equal(calls.length, 0, "--remove --enable must record zero exec calls when a foreign unit is present");
  assert.equal(fs.readFileSync(timerFile, "utf8"), "[Timer]\nOnCalendar=hourly\n", "the user's own timer must still be left byte-identical");
});

test("windows and macos generation (text-only; schtasks/launchctl are never executed on this host)", () => {
  const home = mkTmp("janitor-timer-home-win-");
  fixtureDefaultRepoGit(home);
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
  // J1 review round 1, M2/M3: the payload is wrapped in `/s /c "..."` (cmd.exe strips exactly the
  // outer pair we add), and the declared encoding matches the utf8 bytes actually written.
  assert.match(xml, /<Arguments>\/s \/c "/);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);

  const homeMac = mkTmp("janitor-timer-home-mac-");
  fixtureDefaultRepoGit(homeMac);
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

test("J1 review round 1, B1: --repo or --host carrying the literal string --apply is refused outright, nothing written", () => {
  const home = mkTmp("janitor-timer-home-b1-repo-");
  fixtureDefaultRepoGit(home);
  const pluginRoot = fixturePluginRoot();
  const env = { XDG_CONFIG_HOME: path.join(home, ".config") };

  const capRepo = capture();
  const codeRepo = main(["--force-root", "--json", "--repo", "/srv/repo --apply"], { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, ...capRepo });
  assert.equal(codeRepo, 1);
  const resultRepo = JSON.parse(capRepo.text());
  assert.ok(resultRepo.refusals.some((r) => r.includes("--apply")));
  assert.ok(!fs.existsSync(path.join(home, ".agents", "janitor")), "a refused install must write nothing at all");

  const home2 = mkTmp("janitor-timer-home-b1-host-");
  fixtureDefaultRepoGit(home2);
  const pluginRoot2 = fixturePluginRoot();
  const env2 = { XDG_CONFIG_HOME: path.join(home2, ".config") };
  const capHost = capture();
  const codeHost = main(["--force-root", "--json", "--host", "box --apply"], { home: home2, env: env2, platform: "linux", execPath: "/usr/bin/node", pluginRoot: pluginRoot2, ...capHost });
  assert.equal(codeHost, 1);
  const resultHost = JSON.parse(capHost.text());
  assert.ok(resultHost.refusals.some((r) => r.includes("--apply")));
  assert.ok(!fs.existsSync(path.join(home2, ".agents", "janitor")), "a refused install must write nothing at all");
});

test("J1 review round 1, B1: an ordinary space-bearing repo (no --apply) still generates a single, correctly quoted ExecStart argv element", () => {
  const home = mkTmp("janitor-timer-home-b1-space-");
  const pluginRoot = fixturePluginRoot();
  const env = { XDG_CONFIG_HOME: path.join(home, ".config") };
  const spaceRepo = path.join(home, "my repo");
  fs.mkdirSync(path.join(spaceRepo, ".git"), { recursive: true });

  const cap = capture();
  const code = main(["--force-root", "--json", "--repo", spaceRepo], { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, ...cap });
  assert.equal(code, 0);
  const serviceFile = path.join(home, ".config", "systemd", "user", "janitor-record.service");
  const serviceText = fs.readFileSync(serviceFile, "utf8");
  assert.match(serviceText, new RegExp(`ExecStart=\\S+ \\S+ --record --repo "${spaceRepo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
});

test("J1 review round 1, M5: refuses when the janitor script is missing, or the repo is not a git checkout — nothing written, exit 1", () => {
  const home1 = mkTmp("janitor-timer-home-m5-noscript-");
  fixtureDefaultRepoGit(home1);
  const emptyPluginRoot = mkTmp("janitor-timer-plugin-empty-");
  fs.mkdirSync(path.join(emptyPluginRoot, "scripts"), { recursive: true }); // no janitor.mjs inside
  const cap1 = capture();
  const code1 = main(["--force-root", "--json"], { home: home1, platform: "linux", execPath: "/usr/bin/node", pluginRoot: emptyPluginRoot, ...cap1 });
  assert.equal(code1, 1);
  const result1 = JSON.parse(cap1.text());
  assert.ok(result1.refusals.some((r) => r.includes("missing janitor script")));
  assert.ok(!fs.existsSync(path.join(home1, ".agents")));

  const home2 = mkTmp("janitor-timer-home-m5-norepo-"); // no .git created under home2/Code/claude-delegation
  const pluginRoot2 = fixturePluginRoot();
  const cap2 = capture();
  const code2 = main(["--force-root", "--json"], { home: home2, platform: "linux", execPath: "/usr/bin/node", pluginRoot: pluginRoot2, ...cap2 });
  assert.equal(code2, 1);
  const result2 = JSON.parse(cap2.text());
  assert.ok(result2.refusals.some((r) => r.includes("is not a git checkout")));
  assert.ok(!fs.existsSync(path.join(home2, ".agents")));

  // Also refused under --dry-run (before any write), per the brief.
  const home3 = mkTmp("janitor-timer-home-m5-dryrun-");
  const pluginRoot3 = fixturePluginRoot();
  const cap3 = capture();
  const code3 = main(["--force-root", "--dry-run", "--json"], { home: home3, platform: "linux", execPath: "/usr/bin/node", pluginRoot: pluginRoot3, ...cap3 });
  assert.equal(code3, 1);
});

after(() => {
  for (const dir of tracked) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort cleanup of this file's own fixtures */ }
  }
});
