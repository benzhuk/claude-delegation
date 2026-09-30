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
  isInstalledPluginRoot,
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
  // C2: same reasoning, for the collect job's own script — a stub here so a fixture root built by
  // this ONE helper works for either --job without a second, near-duplicate fixture builder.
  fs.writeFileSync(path.join(dir, "scripts", "collect-status.mjs"), "// stub for install-janitor-timer tests\n");
  fs.writeFileSync(path.join(dir, "scripts", "knowledge-triage.mjs"), "// stub for install-janitor-timer tests\n");
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

// Lane 59 (ruling r0, F15 cut): the janitor job's default argv now carries --apply, on purpose - see
// scheduledCommandArgv's own comment for why. There is no installer flag to turn it back off; the
// kill switch (janitor.mjs's ~/.agents/ws-off-janitor-act) is the only off path, checked at run
// time. The collect job is untouched: --apply must still never appear anywhere in ITS generated
// text, for any of the three schedulers, exactly as before this lane.
test("--apply never appears in the collect job's generated text, for any of the three schedulers", () => {
  const inputs = {
    node: "/usr/bin/node", pluginRoot: "/opt/plugin", repo: "/home/x/Code/claude-delegation",
    host: "hostA", hour: 6, logPath: "/home/x/.agents/collect/last-run.log", name: "collect-status",
    label: "com.delegation.collect-status", job: "collect-status", to: "skills-fable", every: 15, staleHours: 2,
  };
  for (const text of [
    systemdServiceUnit(inputs), systemdTimerUnit(inputs), windowsTaskXml(inputs), launchdPlist(inputs),
    installedJsonText({ ...inputs, scheduler: "systemd-user" }),
    scheduledCommandArgv(inputs).join(" "),
  ]) {
    assert.ok(!text.includes("--apply"), `collect job must never contain --apply: ${text}`);
  }
});

test("scheduledCommandArgv (janitor job) is exactly <node> <pluginRoot>/scripts/janitor.mjs --record --repo <repo> [--host <h>] --apply", () => {
  const base = scheduledCommandArgv({ node: "/n/node", pluginRoot: "/p", repo: "/r" });
  assert.deepEqual(base, ["/n/node", path.join("/p", "scripts", "janitor.mjs"), "--record", "--repo", "/r", "--apply"]);
  const withHost = scheduledCommandArgv({ node: "/n/node", pluginRoot: "/p", repo: "/r", host: "netcup" });
  assert.deepEqual(withHost, ["/n/node", path.join("/p", "scripts", "janitor.mjs"), "--record", "--repo", "/r", "--host", "netcup", "--apply"]);
});

test("C3/F15: the janitor job's default argv carries --apply; there is no --record-only installer flag to remove it, and the user-value --apply refusal still fires", () => {
  // The default argv itself carries --apply now - this is the new, intentional default, not a bug.
  const argv = scheduledCommandArgv({ node: "/n/node", pluginRoot: "/p", repo: "/r" });
  assert.ok(argv.includes("--apply"), "the janitor job's default argv must carry --apply");
  // No installer flag exists to strip it back out - main() has no --record-only handling at all.
  assert.ok(!fs.readFileSync(new URL("./install-janitor-timer.mjs", import.meta.url), "utf8").includes("record-only"));
  // The pre-existing B1 refusal (a --repo/--host VALUE containing the literal text "--apply") is
  // unrelated to the installer's own argv and must still fire exactly as before this lane.
  const home = mkTmp("janitor-timer-home-c3-userapply-");
  fixtureDefaultRepoGit(home);
  const cap = capture();
  const code = main(["--force-root", "--json", "--repo", "/tmp/evil --apply x"], {
    home, env: { XDG_CONFIG_HOME: path.join(home, ".config") }, platform: "linux",
    execPath: "/usr/bin/node", pluginRoot: fixturePluginRoot(), ...cap,
  });
  assert.equal(code, 1);
  const result = JSON.parse(cap.text());
  assert.ok(result.refusals.some((r) => r.includes("contains the string --apply")), JSON.stringify(result.refusals));
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

test("L2: a plugin root inside the installed Claude plugin cache installs without --force-root", () => {
  const home = mkTmp("janitor-timer-home-l2-cache-");
  fixtureDefaultRepoGit(home);
  const cacheRoot = path.join(home, ".claude", "plugins", "cache", "benzhuk", "delegation", "0.0.0");
  fs.mkdirSync(path.join(cacheRoot, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(cacheRoot, "scripts", "janitor.mjs"), "// stub for install-janitor-timer tests\n");
  const cap = capture();
  const code = main(["--json"], {
    home, env: { XDG_CONFIG_HOME: path.join(home, ".config") }, platform: "linux",
    execPath: "/usr/bin/node", pluginRoot: cacheRoot, ...cap,
  });
  assert.equal(code, 0);
  const result = JSON.parse(cap.text());
  assert.equal(result.refusals.length, 0, JSON.stringify(result.refusals));
});

test("L2 review: the allowlist itself rejects this host's real worktree layout and accepts only the two caches", () => {
  const home = "/home/u";
  for (const p of [
    "/home/u/Code/claude-delegation-wt/janitor-daily-base",
    "/home/u/Code/claude-delegation",
    "/home/u/.claude/plugins/cache-evil/x",
    "/home/u/.claude/plugins/cache/../../../Code/x",
    "/home/u/.claude/plugins",
  ]) assert.equal(isInstalledPluginRoot(p, { home }), false, p);
  for (const p of [
    "/home/u/.claude/plugins/cache/benzhuk/delegation/0.0.0",
    "/home/u/.claude/plugins/cache/benzhuk/delegation/0.0.0/",
    "/home/u/.codex/plugins/cache/delegation/delegation/0.0.0",
  ]) assert.equal(isInstalledPluginRoot(p, { home }), true, p);
});

test("L2: a real worktree name, a durable non-cache path, and a fresh non-cache root all refuse under --dry-run and a real install, on the pluginRoot check alone, nothing written", () => {
  for (const dryRunArgv of [[], ["--dry-run"]]) {
    for (const makeRoot of [
      (home) => path.join(home, "Code", "claude-delegation-wt", "x"),
      (home) => path.join(home, "Code", "claude-delegation"),
      () => mkTmp("janitor-timer-l2-outside-cache-"),
    ]) {
      const home = mkTmp("janitor-timer-home-l2-notcache-");
      fixtureDefaultRepoGit(home);
      const root = makeRoot(home);
      fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
      fs.writeFileSync(path.join(root, "scripts", "janitor.mjs"), "//\n");
      const cap = capture();
      const code = main(["--json", ...dryRunArgv], {
        home, env: { XDG_CONFIG_HOME: path.join(home, ".config") }, platform: "linux",
        execPath: "/usr/bin/node", pluginRoot: root, ...cap,
      });
      assert.equal(code, 1);
      const result = JSON.parse(cap.text());
      assert.equal(result.refusals.length, 1, JSON.stringify(result.refusals));
      assert.match(result.refusals[0], /temporary checkout|not an installed plugin location/);
      assert.ok(!fs.existsSync(path.join(home, ".agents")), "a refused install must write nothing at all");
    }
  }
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
  // Lane 59 (ruling r0, F15): the janitor job's ExecStart now carries --apply by default - see
  // scheduledCommandArgv's own comment. installed.json (below) never embeds the argv at all, so
  // that record is unaffected either way.
  assert.ok(serviceText.includes("--apply"));

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
    // Lane 59 (ruling r0, F15): only the service/unit content that embeds ExecStart carries the
    // janitor job's default --apply; installed.json never embeds the argv at all.
    if (/ExecStart/.test(f.content)) assert.ok(f.content.includes("--apply"), `ExecStart content must carry --apply for ${f.path}`);
    else assert.ok(!f.content.includes("--apply"), `non-ExecStart content must not carry --apply for ${f.path}`);
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
  // J1 review round 2, m1: the twin of r1 m4 — the note text must not claim past tense "files
  // removed" when --dry-run left every file in place.
  assert.match(result.note, /^files would be removed/);
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

test("seam review round 1, M1: installed.json is name-owned — a second --name install is refused, and --remove for that name never touches a different name's installed.json", () => {
  const home = mkTmp("janitor-timer-home-name-owned-");
  fixtureDefaultRepoGit(home);
  const pluginRoot = fixturePluginRoot();
  const env = { XDG_CONFIG_HOME: path.join(home, ".config") };
  const installedPath = path.join(home, ".agents", "janitor", "installed.json");

  // 1. Real (default-name) install.
  const cap1 = capture();
  const code1 = main(["--force-root", "--json"], { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, ...cap1 });
  assert.equal(code1, 0);
  const installedAfterReal = fs.readFileSync(installedPath, "utf8");
  assert.equal(JSON.parse(installedAfterReal).name, "janitor-record");

  // 2. A --name janitor-record-test install must be refused outright, leaving installed.json
  // byte-identical — a test install must never blind the real one's shared installed.json.
  const cap2 = capture();
  const code2 = main(["--force-root", "--json", "--name", "janitor-record-test"], {
    home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, ...cap2,
  });
  assert.equal(code2, 1, "a second named install while a different name is recorded must be refused");
  assert.equal(fs.readFileSync(installedPath, "utf8"), installedAfterReal, "installed.json must be untouched by the refused install");
  const result2 = JSON.parse(cap2.text());
  assert.ok(result2.refusals.some((r) => r.includes("janitor-record")), "the refusal must name the recorded name");

  // 3. --remove --name janitor-record-test must leave installed.json present (it records a
  // different name), even though the test's own unit files (never created above) report absent.
  const cap3 = capture();
  const code3 = main(["--remove", "--json", "--name", "janitor-record-test"], { home, env, platform: "linux", pluginRoot, ...cap3 });
  assert.equal(code3, 0);
  assert.ok(fs.existsSync(installedPath), "installed.json must still be present after removing an unrelated name");
  assert.equal(fs.readFileSync(installedPath, "utf8"), installedAfterReal);
  const result3 = JSON.parse(cap3.text());
  const installedResult3 = result3.files.find((f) => f.path === installedPath);
  assert.equal(installedResult3.status, "left-untouched-foreign");
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
  // J1 review round 2, m2: "0x10" and " " both used to sneak past Number()+Number.isInteger (16 and
  // 0 respectively) and install at an unintended hour.
  for (const bad of ["99", "7.5", "-1", "nope", "0x10", " "]) {
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

test("J1 review round 2, m2: a valueless --hour (nothing follows, or another --flag follows) refuses rather than silently falling back to the default hour", () => {
  for (const argvTail of [["--hour"], ["--hour", "--json"]]) {
    const home = mkTmp("janitor-timer-home-hour-noval-");
    fixtureDefaultRepoGit(home);
    const pluginRoot = fixturePluginRoot();
    const env = { XDG_CONFIG_HOME: path.join(home, ".config") };
    const cap = capture();
    const code = main(["--force-root", "--json", ...argvTail], { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, ...cap });
    assert.equal(code, 1, `--hour with no value (argv=${JSON.stringify(argvTail)}) must be refused`);
    const result = JSON.parse(cap.text());
    assert.ok(
      result.refusals.some((r) => r.includes("--hour must be an integer 0-23")),
      `expected an --hour refusal for argv=${JSON.stringify(argvTail)}, got ${JSON.stringify(result.refusals)}`,
    );
    assert.ok(!fs.existsSync(path.join(home, ".agents")), `valueless --hour must write nothing at all`);
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

test("J1 review round 2, m3: a failing post-remove daemon-reload is reported in result.commands, not swallowed silently", () => {
  const home = mkTmp("janitor-timer-home-m3-reload-fail-");
  fixtureDefaultRepoGit(home);
  const pluginRoot = fixturePluginRoot();
  const env = { XDG_CONFIG_HOME: path.join(home, ".config") };

  // Install first (real exec, always succeeds) so there is something to remove.
  main(["--force-root", "--json", "--enable"], { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, exec: (() => "") , ...capture() });

  // Now remove with an exec that fails ONLY on the daemon-reload call (the disable call above it
  // still succeeds), and assert the failure is reported, not dropped.
  const fakeExecReloadFails = (cmd, args) => {
    if (cmd === "systemctl" && args.includes("daemon-reload")) throw new Error("boom: unit not found");
    return "";
  };
  const cap = capture();
  const code = main(["--remove", "--json", "--enable"], { home, env, platform: "linux", pluginRoot, exec: fakeExecReloadFails, ...cap });
  assert.equal(code, 0, "a failing best-effort daemon-reload must not turn a successful remove into a failure");
  const result = JSON.parse(cap.text());
  const reloadEntry = result.commands.find((c) => c.startsWith("systemctl --user daemon-reload"));
  assert.ok(reloadEntry, `expected a daemon-reload entry in result.commands, got ${JSON.stringify(result.commands)}`);
  assert.match(reloadEntry, /\(failed: boom: unit not found\)/);
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
  // Windows-task-1: no --enable given (the no-enable path) — install must write files and never
  // shell out. A fakeExec spy proves it: if anything called it, calls.length would be nonzero.
  const calls = [];
  const fakeExec = (cmd, args) => { calls.push([cmd, ...args].join(" ")); return ""; };
  const cap = capture();
  const code = main(["--force-root", "--json", "--name", "janitor-record-test"], {
    home, platform: "win32", execPath: "C:\\node\\node.exe", pluginRoot, exec: fakeExec, ...cap,
  });
  assert.equal(code, 0);
  assert.equal(calls.length, 0, "the no-enable path must never shell out to schtasks");
  const result = JSON.parse(cap.text());
  assert.equal(result.scheduler, "schtasks");
  const xmlPath = path.join(home, ".agents", "janitor", "janitor-record-test.task.xml");
  assert.ok(fs.existsSync(xmlPath));

  // Windows-task-1 (2026-09-27 defect): Task Scheduler's XML import requires UTF-16 — the old
  // UTF-8-declared file was refused live ("(1,40) unable to switch the encoding"). Read raw bytes,
  // not "utf8" text, so the assertions below actually prove the bytes on disk, not a re-encoded view.
  const xmlBuf = fs.readFileSync(xmlPath);
  // BOM present: the first two bytes are the UTF-16LE byte-order mark.
  assert.equal(xmlBuf[0], 0xff, "expected a UTF-16LE BOM (0xFF) as the first byte");
  assert.equal(xmlBuf[1], 0xfe, "expected a UTF-16LE BOM (0xFE) as the second byte");
  const xml = xmlBuf.toString("utf16le");
  // Declaration says UTF-16, matching the bytes actually written.
  assert.match(xml, /^\ufeff<\?xml version="1\.0" encoding="UTF-16"\?>/);
  assert.ok(xml.includes("<!-- generated by delegation install-janitor-timer -->"));
  // Lane 59 (ruling r0, F15): the janitor job's default argv now carries --apply.
  assert.ok(xml.includes("--apply"));
  assert.ok(xml.includes("--record"));
  // J1 review round 1, M2: the payload is wrapped in `/s /c "..."` (cmd.exe strips exactly the
  // outer pair we add).
  assert.match(xml, /<Arguments>\/s \/c "/);

  // readMarked recognises the marker in this UTF-16 file: a second install call sees it as
  // "unchanged" (marked + identical bytes), never "left-untouched-foreign".
  const capAgain = capture();
  const codeAgain = main(["--force-root", "--json", "--name", "janitor-record-test"], {
    home, platform: "win32", execPath: "C:\\node\\node.exe", pluginRoot, exec: fakeExec, ...capAgain,
  });
  assert.equal(codeAgain, 0);
  assert.equal(calls.length, 0, "a second no-enable install must still never shell out");
  const resultAgain = JSON.parse(capAgain.text());
  const xmlResultAgain = resultAgain.files.find((f) => f.path === xmlPath);
  assert.equal(xmlResultAgain.status, "unchanged", "readMarked must recognise the marker in the UTF-16 file");

  // readMarked still refuses a foreign file: overwrite the task xml with a real-world-shaped
  // UTF-16LE-with-BOM file (Task Scheduler's own exports are UTF-16 too) that carries no marker —
  // the BOM-aware decode must still tell this apart from our own file and leave it alone.
  const foreignXml = '\ufeff<?xml version="1.0" encoding="UTF-16"?>\n<Task><NotOurs/></Task>\n';
  fs.writeFileSync(xmlPath, foreignXml, "utf16le");
  const capForeign = capture();
  const codeForeign = main(["--force-root", "--json", "--name", "janitor-record-test"], {
    home, platform: "win32", execPath: "C:\\node\\node.exe", pluginRoot, exec: fakeExec, ...capForeign,
  });
  assert.equal(codeForeign, 1, "install must refuse to finish when the same-named task xml is foreign");
  assert.equal(calls.length, 0);
  assert.equal(fs.readFileSync(xmlPath, "utf16le"), foreignXml, "a foreign UTF-16 file must be left byte-identical");
  const resultForeign = JSON.parse(capForeign.text());
  assert.ok(
    resultForeign.refusals.some((r) => r.includes("foreign")),
    JSON.stringify(resultForeign.refusals),
  );

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
  // Lane 59 (ruling r0, F15): the janitor job's default argv now carries --apply.
  assert.ok(plist.includes("--apply"));
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
  // J1 review round 2, M1: a whole-text regex built from the raw spaceRepo (escaped only as a regex
  // literal) fails on Windows, where systemdQuote doubles backslashes inside the quotes — the unit
  // reads `--repo "C:\\...\\my repo"` while a naively-escaped regex expects single backslashes.
  // Compare the ExecStart line directly against the doubled form instead of building a regex from
  // the raw path.
  const execLine = serviceText.split("\n").find((l) => l.startsWith("ExecStart="));
  assert.ok(execLine.includes(` --record --repo "${spaceRepo.replace(/\\/g, "\\\\")}" `), execLine);
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

test("L1: --help prints usage, exits 0, and writes nothing — even against the installer's own default (worktree) pluginRoot", () => {
  const home = mkTmp("janitor-timer-home-l1-help-");
  const cap = capture();
  const code = main(["--help"], { home, platform: "linux", execPath: "/usr/bin/node", ...cap });
  assert.equal(code, 0);
  assert.match(cap.text(), /Usage: install-janitor-timer/);
  assert.ok(!fs.existsSync(path.join(home, ".agents")), "--help must write nothing at all");
});

test("L1: an unrecognized flag (--bogus) exits 2 and writes nothing", () => {
  const home = mkTmp("janitor-timer-home-l1-bogus-");
  const cap = capture();
  const code = main(["--bogus"], { home, platform: "linux", execPath: "/usr/bin/node", ...cap });
  assert.equal(code, 2);
  assert.match(cap.text(), /usage error: unrecognized argument\(s\): --bogus/);
  assert.ok(!fs.existsSync(path.join(home, ".agents")), "--bogus must write nothing at all");
});

test("L1: a stray positional argument exits 2 and writes nothing", () => {
  const home = mkTmp("janitor-timer-home-l1-positional-");
  const cap = capture();
  const code = main(["--dry-run", "extra-positional"], { home, platform: "linux", execPath: "/usr/bin/node", ...cap });
  assert.equal(code, 2);
  assert.match(cap.text(), /usage error: unrecognized argument\(s\): extra-positional/);
  assert.ok(!fs.existsSync(path.join(home, ".agents")), "a stray positional argument must write nothing at all");
});

test("L1 review: a valueless/empty --repo/--host/--name, or a repeated value flag, refuses and touches nothing", () => {
  const cases = [["--repo"], ["--repo", ""], ["--repo", "--dry-run"], ["--host"], ["--host", ""], ["--name"], ["--enable", "--repo"], ["--hour", "3", "--hour", "5"], ["--repo", "/a", "--repo", "/b"]];
  for (const argvTail of cases) {
    const home = mkTmp("janitor-timer-home-l1-noval-");
    fixtureDefaultRepoGit(home);
    const calls = [];
    const cap = capture();
    const code = main(["--force-root", "--json", ...argvTail], {
      home, env: { XDG_CONFIG_HOME: path.join(home, ".config") }, platform: "linux", execPath: "/usr/bin/node",
      pluginRoot: fixturePluginRoot(), exec: (c, a) => calls.push([c, ...a].join(" ")), ...cap,
    });
    assert.equal(code, 1, JSON.stringify(argvTail));
    assert.ok(!fs.existsSync(path.join(home, ".agents")), JSON.stringify(argvTail));
    assert.deepEqual(calls, [], JSON.stringify(argvTail));
  }
  // --remove with the --name value forgotten must never fall back to removing the real janitor-record.
  const home = mkTmp("janitor-timer-home-l1-remove-noname-");
  fixtureDefaultRepoGit(home);
  const env = { XDG_CONFIG_HOME: path.join(home, ".config") };
  const pluginRoot = fixturePluginRoot();
  assert.equal(main(["--force-root"], { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, stdout: () => {} }), 0);
  const calls = [];
  const code = main(["--remove", "--name", "--enable"], { home, env, platform: "linux", pluginRoot, exec: (c, a) => calls.push([c, ...a].join(" ")), stdout: () => {} });
  assert.equal(code, 1);
  assert.deepEqual(calls, []);
  assert.ok(fs.existsSync(path.join(home, ".config", "systemd", "user", "janitor-record.timer")));
});

// ─────────────────────────────────────────────────────────────────────────────
// C2: --job collect-status (docs/specs/collect-status-1/contracts.md K1/K3)
// ─────────────────────────────────────────────────────────────────────────────

test("C2: scheduledCommandArgv for --job collect-status is exactly <node> <pluginRoot>/scripts/collect-status.mjs --repo <repo> --to <slug>, plus --host and --out when given, plus --stale-hours <n> always last (lane 33 F1, default 2)", () => {
  const base = scheduledCommandArgv({ node: "/n/node", pluginRoot: "/p", repo: "/r", job: "collect-status", to: "skills-fable" });
  assert.deepEqual(base, ["/n/node", path.join("/p", "scripts", "collect-status.mjs"), "--repo", "/r", "--to", "skills-fable", "--stale-hours", 2]);

  const withHost = scheduledCommandArgv({ node: "/n/node", pluginRoot: "/p", repo: "/r", job: "collect-status", to: "skills-fable", host: "netcup" });
  assert.deepEqual(withHost, ["/n/node", path.join("/p", "scripts", "collect-status.mjs"), "--repo", "/r", "--to", "skills-fable", "--host", "netcup", "--stale-hours", 2]);

  const withOut = scheduledCommandArgv({ node: "/n/node", pluginRoot: "/p", repo: "/r", job: "collect-status", to: "skills-fable", host: "netcup", out: "/tmp/out" });
  assert.deepEqual(withOut, ["/n/node", path.join("/p", "scripts", "collect-status.mjs"), "--repo", "/r", "--to", "skills-fable", "--host", "netcup", "--out", "/tmp/out", "--stale-hours", 2]);

  const withStaleHours = scheduledCommandArgv({ node: "/n/node", pluginRoot: "/p", repo: "/r", job: "collect-status", to: "skills-fable", staleHours: 0.5 });
  assert.deepEqual(withStaleHours, ["/n/node", path.join("/p", "scripts", "collect-status.mjs"), "--repo", "/r", "--to", "skills-fable", "--stale-hours", 0.5]);

  // The default job (no `job` argument at all, or `job: "janitor-record"` explicitly) is unaffected
  // by C2/K1 — --stale-hours is a collect-status-only flag. It DOES carry --apply by default now
  // (Lane 59, ruling r0, F15) — a separate, unrelated change to this same function.
  assert.deepEqual(
    scheduledCommandArgv({ node: "/n/node", pluginRoot: "/p", repo: "/r", job: "janitor-record" }),
    ["/n/node", path.join("/p", "scripts", "janitor.mjs"), "--record", "--repo", "/r", "--apply"],
  );
});

test("C2: installedJsonText for --job collect-status is schema, repo, node, every, staleHours, scheduler, name, to — key order exact, no hour field at all (lane 33 F1)", () => {
  const text = installedJsonText({ repo: "/r", node: "/n", scheduler: "systemd-user", name: "collect-status", job: "collect-status", every: 15, to: "skills-fable", staleHours: 2 });
  assert.equal(text, '{"schema":1,"repo":"/r","node":"/n","every":15,"staleHours":2,"scheduler":"systemd-user","name":"collect-status","to":"skills-fable"}\n');
  // The default job's shape (schema, repo, node, hour, scheduler, name) is untouched.
  assert.equal(
    installedJsonText({ repo: "/r", node: "/n", hour: 6, scheduler: "systemd-user", name: "janitor-record" }),
    '{"schema":1,"repo":"/r","node":"/n","hour":6,"scheduler":"systemd-user","name":"janitor-record"}\n',
  );
});

test("C2: systemd unit and timer text for --job collect-status — exact bytes", { skip: process.platform === "win32" ? "the systemd generator runs only on linux hosts, and these fixtures are POSIX paths" : false }, () => {
  const inputs = {
    node: "/usr/bin/node", pluginRoot: "/opt/plugin", repo: "/home/x/Code/claude-delegation",
    host: "hostA", logPath: "/home/x/.agents/collect/last-run.log", name: "collect-status",
    job: "collect-status", to: "skills-fable", every: 15, staleHours: 2,
  };
  const service = systemdServiceUnit(inputs);
  assert.equal(
    service,
    "# generated by delegation collect-status installer\n" +
    "[Unit]\n" +
    "Description=Delegation collect-status (lane state to the lead, report-only)\n" +
    "\n" +
    "[Service]\n" +
    "Type=oneshot\n" +
    "WorkingDirectory=/home/x/Code/claude-delegation\n" +
    "Environment=PATH=/usr/bin:/usr/bin:/bin\n" +
    "ExecStart=/usr/bin/node /opt/plugin/scripts/collect-status.mjs --repo /home/x/Code/claude-delegation --to skills-fable --host hostA --stale-hours 2\n" +
    "StandardOutput=truncate:/home/x/.agents/collect/last-run.log\n" +
    "StandardError=truncate:/home/x/.agents/collect/last-run.log\n",
  );
  const timer = systemdTimerUnit(inputs);
  assert.equal(
    timer,
    "# generated by delegation collect-status installer\n" +
    "[Unit]\n" +
    "Description=Interval timer for collect-status (report-only)\n" +
    "\n" +
    "[Timer]\n" +
    "OnBootSec=2min\n" +
    "OnUnitActiveSec=15min\n" +
    "Persistent=false\n" +
    "\n" +
    "[Install]\n" +
    "WantedBy=timers.target\n",
  );
  assert.ok(!service.includes("--apply") && !timer.includes("--apply"));
});

test("C2: Windows TimeTrigger/Repetition and launchd StartInterval shapes for --job collect-status, both carrying --stale-hours (lane 33 F1)", () => {
  const inputs = {
    node: "C:\\node\\node.exe", pluginRoot: "C:\\plugin", repo: "C:\\repo", host: "hostA",
    logPath: "C:\\log.txt", job: "collect-status", to: "skills-fable", every: 20, staleHours: 0.5,
  };
  const xml = windowsTaskXml(inputs);
  assert.match(xml, /<TimeTrigger>/);
  assert.match(xml, /<Interval>PT20M<\/Interval>/);
  assert.match(xml, /<StopAtDurationEnd>false<\/StopAtDurationEnd>/);
  assert.ok(!xml.includes("<CalendarTrigger>"));
  assert.ok(!xml.includes("--apply"));
  assert.match(xml, /&quot;--stale-hours&quot; &quot;0\.5&quot;/, "the Windows task's own Arguments text carries --stale-hours");

  const plist = launchdPlist({ ...inputs, label: "com.delegation.collect-status" });
  assert.match(plist, /<key>StartInterval<\/key>\s*<integer>1200<\/integer>/);
  assert.ok(!plist.includes("StartCalendarInterval"));
  assert.ok(!plist.includes("--apply"));
  assert.match(plist, /--stale-hours' '0\.5'/, "the launchd plist's own sh -c command carries --stale-hours");

  // The default job's XML/plist shapes are untouched.
  const defaultInputs = { node: "/usr/bin/node", pluginRoot: "/p", repo: "/r", host: "h", hour: 6, logPath: "/l" };
  assert.match(windowsTaskXml(defaultInputs), /<CalendarTrigger>/);
  assert.ok(!windowsTaskXml(defaultInputs).includes("--stale-hours"), "the janitor job's own XML never carries --stale-hours");
  assert.match(launchdPlist({ ...defaultInputs, label: "com.delegation.janitor-record" }), /StartCalendarInterval/);
  assert.ok(!launchdPlist({ ...defaultInputs, label: "com.delegation.janitor-record" }).includes("--stale-hours"), "the janitor job's own plist never carries --stale-hours");
});

test("C2: --stale-hours 0.5 appears in the systemd ExecStart too (all three generators, lane 33 F1)", { skip: process.platform === "win32" ? "the systemd generator runs only on linux hosts, and these fixtures are POSIX paths" : false }, () => {
  const service = systemdServiceUnit({
    node: "/usr/bin/node", pluginRoot: "/opt/plugin", repo: "/home/x/Code/claude-delegation",
    host: "hostA", logPath: "/home/x/.agents/collect/last-run.log",
    job: "collect-status", to: "skills-fable", staleHours: 0.5,
  });
  assert.match(service, /ExecStart=.*--stale-hours 0\.5\n/);
});

test("C2: --stale-hours bounds — 0.1 and 48 accepted, out of range or non-numeric refused (exit 1, nothing written), default is 2", () => {
  for (const good of ["0.1", "48", "2", "0.5"]) {
    const home = mkTmp("janitor-timer-home-stale-good-");
    fixtureDefaultRepoGit(home);
    const pluginRoot = fixturePluginRoot();
    const env = { XDG_CONFIG_HOME: path.join(home, ".config") };
    const cap = capture();
    const code = main(["--force-root", "--json", "--job", "collect-status", "--to", "x", "--stale-hours", good], { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, ...cap });
    assert.equal(code, 0, `--stale-hours ${good} should be accepted: ${cap.text()}`);
    assert.equal(JSON.parse(cap.text()).staleHours, Number(good));
  }
  for (const bad of ["0", "99", "-1", "nope", "0x10", " "]) {
    const home = mkTmp("janitor-timer-home-stale-bad-");
    fixtureDefaultRepoGit(home);
    const pluginRoot = fixturePluginRoot();
    const env = { XDG_CONFIG_HOME: path.join(home, ".config") };
    const cap = capture();
    const code = main(["--force-root", "--json", "--job", "collect-status", "--to", "x", "--stale-hours", bad], { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, ...cap });
    assert.equal(code, 1, `--stale-hours ${bad} must be refused`);
    const result = JSON.parse(cap.text());
    assert.ok(result.refusals.some((r) => r.includes("--stale-hours must be a number from 0.1 to 48")), JSON.stringify(result.refusals));
    assert.ok(!fs.existsSync(path.join(home, ".agents")), `--stale-hours ${bad} must write nothing at all`);
  }

  // Default, when the flag is never given: 2 (matching lane 30's hand-edited live value).
  const home = mkTmp("janitor-timer-home-stale-default-");
  fixtureDefaultRepoGit(home);
  const cap = capture();
  const code = main(["--force-root", "--json", "--job", "collect-status", "--to", "x"], { home, platform: "linux", execPath: "/usr/bin/node", pluginRoot: fixturePluginRoot(), ...cap });
  assert.equal(code, 0);
  assert.equal(JSON.parse(cap.text()).staleHours, 2);

  // --stale-hours is refused for --job janitor-record (lane 33 F4) — it is a collect-status-only flag.
  const janitorHome = mkTmp("janitor-timer-home-stale-on-janitor-");
  fixtureDefaultRepoGit(janitorHome);
  const janitorCap = capture();
  const janitorCode = main(["--force-root", "--json", "--stale-hours", "3"], { home: janitorHome, platform: "linux", execPath: "/usr/bin/node", pluginRoot: fixturePluginRoot(), ...janitorCap });
  assert.equal(janitorCode, 1);
  assert.ok(
    JSON.parse(janitorCap.text()).refusals.some((r) => r.includes("--stale-hours is refused for --job janitor-record")),
    JSON.stringify(JSON.parse(janitorCap.text()).refusals),
  );
  assert.ok(!fs.existsSync(path.join(janitorHome, ".agents")));
});

test("C2: --stale-hours 0.5 given to main reaches every platform's written command and installed.json (lane 33 F1)", () => {
  const want = { linux: "--stale-hours 0.5", win32: "&quot;--stale-hours&quot; &quot;0.5&quot;", darwin: "'--stale-hours' '0.5'" };
  for (const platform of ["linux", "win32", "darwin"]) {
    const home = mkTmp(`janitor-timer-home-stale-${platform}-`);
    fixtureDefaultRepoGit(home);
    const cap = capture();
    const code = main(["--force-root", "--json", "--dry-run", "--job", "collect-status", "--to", "x", "--stale-hours", "0.5"], { home, env: { XDG_CONFIG_HOME: path.join(home, ".config") }, platform, execPath: "/usr/bin/node", pluginRoot: fixturePluginRoot(), ...cap });
    assert.equal(code, 0, cap.text());
    const files = JSON.parse(cap.text()).files;
    const cmdFile = files.find((f) => /\.(service|task\.xml|plist)$/.test(f.path));
    assert.ok(cmdFile && cmdFile.content.includes(want[platform]), `${platform}: ${cmdFile && cmdFile.content}`);
    const inst = files.find((f) => f.path.endsWith("installed.json"));
    assert.equal(JSON.parse(inst.content).staleHours, 0.5, platform);
  }
});

test("C2: a real install (--job collect-status) writes to ~/.agents/collect/, never ~/.agents/janitor/, with installed.json matching the pinned K1 shape", () => {
  const home = mkTmp("janitor-timer-home-collect-install-");
  fixtureDefaultRepoGit(home);
  const pluginRoot = fixturePluginRoot();
  const env = { XDG_CONFIG_HOME: path.join(home, ".config") };

  const cap = capture();
  const code = main(
    ["--force-root", "--json", "--job", "collect-status", "--to", "skills-fable", "--host", "test-host"],
    { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, ...cap },
  );
  assert.equal(code, 0, cap.text());
  const result = JSON.parse(cap.text());
  assert.equal(result.scheduler, "systemd-user");
  assert.equal(result.every, 15, "default --every is 15");

  const unitDir = path.join(home, ".config", "systemd", "user");
  const serviceFile = path.join(unitDir, "collect-status.service");
  const timerFile = path.join(unitDir, "collect-status.timer");
  assert.ok(fs.existsSync(serviceFile));
  assert.ok(fs.existsSync(timerFile));
  assert.match(fs.readFileSync(timerFile, "utf8"), /OnBootSec=2min/);
  assert.match(fs.readFileSync(timerFile, "utf8"), /OnUnitActiveSec=15min/);
  assert.match(fs.readFileSync(timerFile, "utf8"), /Persistent=false/);

  const collectInstalledPath = path.join(home, ".agents", "collect", "installed.json");
  assert.ok(fs.existsSync(collectInstalledPath));
  const installed = JSON.parse(fs.readFileSync(collectInstalledPath, "utf8"));
  const repo = path.join(home, "Code", "claude-delegation");
  assert.deepEqual(installed, {
    schema: 1, repo, node: NODE, every: 15, staleHours: 2, scheduler: "systemd-user", name: "collect-status", to: "skills-fable",
  });

  // Never touches the janitor's own directory or installed.json.
  assert.ok(!fs.existsSync(path.join(home, ".agents", "janitor")), "a collect-status install must never write ~/.agents/janitor/");
  assert.ok(fs.existsSync(path.join(home, ".agents", "collect", "last-run.log")) === false, "last-run.log is created by a RUN, not the installer itself");
});

test("C2: --every bounds — 5 and 60 accepted, out of range or non-integer refused, default is 15", () => {
  for (const good of ["5", "60", "30"]) {
    const home = mkTmp("janitor-timer-home-every-good-");
    fixtureDefaultRepoGit(home);
    const pluginRoot = fixturePluginRoot();
    const env = { XDG_CONFIG_HOME: path.join(home, ".config") };
    const cap = capture();
    const code = main(["--force-root", "--json", "--job", "collect-status", "--to", "x", "--every", good], { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, ...cap });
    assert.equal(code, 0, `--every ${good} should be accepted: ${cap.text()}`);
    assert.equal(JSON.parse(cap.text()).every, Number(good));
  }
  for (const bad of ["4", "61", "0", "-1", "nope", "0x10", " "]) {
    const home = mkTmp("janitor-timer-home-every-bad-");
    fixtureDefaultRepoGit(home);
    const pluginRoot = fixturePluginRoot();
    const env = { XDG_CONFIG_HOME: path.join(home, ".config") };
    const cap = capture();
    const code = main(["--force-root", "--json", "--job", "collect-status", "--to", "x", "--every", bad], { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, ...cap });
    assert.equal(code, 1, `--every ${bad} must be refused`);
    const result = JSON.parse(cap.text());
    assert.ok(result.refusals.some((r) => r.includes("--every must be an integer 5-60")), JSON.stringify(result.refusals));
    assert.ok(!fs.existsSync(path.join(home, ".agents")), `--every ${bad} must write nothing at all`);
  }
});

test("C2: --to is required for --job collect-status and refused for --job janitor-record; slug pattern enforced", () => {
  const home1 = mkTmp("janitor-timer-home-to-required-");
  fixtureDefaultRepoGit(home1);
  const cap1 = capture();
  const code1 = main(["--force-root", "--json", "--job", "collect-status"], { home: home1, platform: "linux", execPath: "/usr/bin/node", pluginRoot: fixturePluginRoot(), ...cap1 });
  assert.equal(code1, 1);
  assert.ok(JSON.parse(cap1.text()).refusals.some((r) => r.includes("--to <slug> is required")));
  assert.ok(!fs.existsSync(path.join(home1, ".agents")));

  const home2 = mkTmp("janitor-timer-home-to-refused-janitor-");
  fixtureDefaultRepoGit(home2);
  const cap2 = capture();
  const code2 = main(["--force-root", "--json", "--to", "skills-fable"], { home: home2, platform: "linux", execPath: "/usr/bin/node", pluginRoot: fixturePluginRoot(), ...cap2 });
  assert.equal(code2, 1);
  assert.ok(JSON.parse(cap2.text()).refusals.some((r) => r.includes("--to is refused for --job janitor-record")));
  assert.ok(!fs.existsSync(path.join(home2, ".agents")));

  const home3 = mkTmp("janitor-timer-home-to-badslug-");
  fixtureDefaultRepoGit(home3);
  const cap3 = capture();
  const code3 = main(["--force-root", "--json", "--job", "collect-status", "--to", "Skills_Fable"], { home: home3, platform: "linux", execPath: "/usr/bin/node", pluginRoot: fixturePluginRoot(), ...cap3 });
  assert.equal(code3, 1);
  assert.ok(JSON.parse(cap3.text()).refusals.some((r) => r.includes("--to must match")));
  assert.ok(!fs.existsSync(path.join(home3, ".agents")));
});

test("C2: --hour is refused for --job collect-status; --every is refused for --job janitor-record", () => {
  const home1 = mkTmp("janitor-timer-home-hour-on-collect-");
  fixtureDefaultRepoGit(home1);
  const cap1 = capture();
  const code1 = main(["--force-root", "--json", "--job", "collect-status", "--to", "x", "--hour", "6"], { home: home1, platform: "linux", execPath: "/usr/bin/node", pluginRoot: fixturePluginRoot(), ...cap1 });
  assert.equal(code1, 1);
  assert.ok(JSON.parse(cap1.text()).refusals.some((r) => r.includes("--hour is refused for --job collect-status")));
  assert.ok(!fs.existsSync(path.join(home1, ".agents")));

  const home2 = mkTmp("janitor-timer-home-every-on-janitor-");
  fixtureDefaultRepoGit(home2);
  const cap2 = capture();
  const code2 = main(["--force-root", "--json", "--every", "20"], { home: home2, platform: "linux", execPath: "/usr/bin/node", pluginRoot: fixturePluginRoot(), ...cap2 });
  assert.equal(code2, 1);
  assert.ok(JSON.parse(cap2.text()).refusals.some((r) => r.includes("--every is refused for --job janitor-record")));
  assert.ok(!fs.existsSync(path.join(home2, ".agents")));
});

test("C2: --job with an unrecognized value is refused; --out is refused for --job janitor-record", () => {
  const home1 = mkTmp("janitor-timer-home-bad-job-");
  fixtureDefaultRepoGit(home1);
  const cap1 = capture();
  const code1 = main(["--force-root", "--json", "--job", "bogus-job"], { home: home1, platform: "linux", execPath: "/usr/bin/node", pluginRoot: fixturePluginRoot(), ...cap1 });
  assert.equal(code1, 1);
  assert.ok(JSON.parse(cap1.text()).refusals.some((r) => r.includes("--job must be janitor-record or collect-status")));

  const home2 = mkTmp("janitor-timer-home-out-on-janitor-");
  fixtureDefaultRepoGit(home2);
  const cap2 = capture();
  const code2 = main(["--force-root", "--json", "--out", "/tmp/out"], { home: home2, platform: "linux", execPath: "/usr/bin/node", pluginRoot: fixturePluginRoot(), ...cap2 });
  assert.equal(code2, 1);
  assert.ok(JSON.parse(cap2.text()).refusals.some((r) => r.includes("--out is refused for --job janitor-record")));
});

test("C2 review round 1, m2: --out is resolved to an absolute path (never left relative to the repo's own WorkingDirectory), and a control character (e.g. a real newline) is refused outright", { skip: process.platform === "win32" ? "the systemd generator runs only on linux hosts, and these fixtures are POSIX paths" : false }, () => {
  const home1 = mkTmp("janitor-timer-home-out-relative-");
  fixtureDefaultRepoGit(home1);
  const pluginRoot = fixturePluginRoot();
  const env = { XDG_CONFIG_HOME: path.join(home1, ".config") };
  const cap1 = capture();
  const code1 = main(
    ["--force-root", "--json", "--job", "collect-status", "--to", "skills-fable", "--out", "rel"],
    { home: home1, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, ...cap1 },
  );
  assert.equal(code1, 0, cap1.text());
  const serviceFile = path.join(home1, ".config", "systemd", "user", "collect-status.service");
  const serviceText = fs.readFileSync(serviceFile, "utf8");
  const resolved = path.resolve("rel");
  assert.ok(serviceText.includes(`--out ${resolved}`), serviceText);
  assert.ok(!serviceText.includes("--out rel\n") && !serviceText.includes("--out rel "), serviceText);

  const home2 = mkTmp("janitor-timer-home-out-newline-");
  fixtureDefaultRepoGit(home2);
  const cap2 = capture();
  const code2 = main(
    ["--force-root", "--json", "--job", "collect-status", "--to", "skills-fable", "--out", "out\nExecStartPost=pwn"],
    { home: home2, platform: "linux", execPath: "/usr/bin/node", pluginRoot: fixturePluginRoot(), ...cap2 },
  );
  assert.equal(code2, 1);
  assert.ok(
    JSON.parse(cap2.text()).refusals.some((r) => r.includes("--out must not contain control characters")),
    cap2.text(),
  );
  assert.ok(!fs.existsSync(path.join(home2, ".agents")));
});

test("C2 (contracts.md K3 B1 twin): --to or --out carrying the literal string --apply is refused outright, nothing written", () => {
  const home1 = mkTmp("janitor-timer-home-b1-to-");
  fixtureDefaultRepoGit(home1);
  const cap1 = capture();
  const code1 = main(["--force-root", "--json", "--job", "collect-status", "--to", "x--apply"], { home: home1, platform: "linux", execPath: "/usr/bin/node", pluginRoot: fixturePluginRoot(), ...cap1 });
  assert.equal(code1, 1);
  // C2 review round 1, m4: "x--apply" PASSES SLUG_RE ([a-z0-9-]+), so the slug-pattern refusal
  // never fires here — this exercises the --apply check on --to itself, not the slug check firing
  // for an unrelated reason and merely happening to contain the substring "--apply" in its own text.
  assert.ok(
    JSON.parse(cap1.text()).refusals.some((r) => r.startsWith("refusing: --repo/--host/--to/--out")),
    cap1.text(),
  );
  assert.ok(!fs.existsSync(path.join(home1, ".agents")));

  const home2 = mkTmp("janitor-timer-home-b1-out-");
  fixtureDefaultRepoGit(home2);
  const cap2 = capture();
  const code2 = main(["--force-root", "--json", "--job", "collect-status", "--to", "skills-fable", "--out", "/tmp/out --apply"], { home: home2, platform: "linux", execPath: "/usr/bin/node", pluginRoot: fixturePluginRoot(), ...cap2 });
  assert.equal(code2, 1);
  assert.ok(JSON.parse(cap2.text()).refusals.some((r) => r.includes("--apply")));
  assert.ok(!fs.existsSync(path.join(home2, ".agents")));
});

test("C2 (seam, K1): installed.json records both jobs, each in its own name-owned file — installing collect-status never touches the janitor's installed.json and vice versa", () => {
  const home = mkTmp("janitor-timer-home-both-jobs-");
  fixtureDefaultRepoGit(home);
  const pluginRoot = fixturePluginRoot();
  const env = { XDG_CONFIG_HOME: path.join(home, ".config") };

  main(["--force-root", "--json"], { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, ...capture() });
  const janitorInstalledPath = path.join(home, ".agents", "janitor", "installed.json");
  assert.ok(fs.existsSync(janitorInstalledPath));
  const janitorInstalledBefore = fs.readFileSync(janitorInstalledPath, "utf8");

  const cap = capture();
  const code = main(["--force-root", "--json", "--job", "collect-status", "--to", "skills-fable"], { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, ...cap });
  assert.equal(code, 0, cap.text());

  const collectInstalledPath = path.join(home, ".agents", "collect", "installed.json");
  assert.ok(fs.existsSync(collectInstalledPath));
  assert.equal(JSON.parse(fs.readFileSync(collectInstalledPath, "utf8")).name, "collect-status");

  // The janitor's own installed.json is untouched, byte for byte.
  assert.equal(fs.readFileSync(janitorInstalledPath, "utf8"), janitorInstalledBefore);
  assert.ok(fs.existsSync(path.join(home, ".config", "systemd", "user", "janitor-record.service")), "the earlier janitor install must still be in place");
  assert.ok(fs.existsSync(path.join(home, ".config", "systemd", "user", "collect-status.service")));
});

test("C2 (seam, K3): --remove --job collect-status removes only the collect job's own files, leaving the janitor's timer/service/installed.json in place", () => {
  const home = mkTmp("janitor-timer-home-remove-onejob-");
  fixtureDefaultRepoGit(home);
  const pluginRoot = fixturePluginRoot();
  const env = { XDG_CONFIG_HOME: path.join(home, ".config") };

  main(["--force-root", "--json"], { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, ...capture() });
  main(["--force-root", "--json", "--job", "collect-status", "--to", "skills-fable"], { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, ...capture() });

  const unitDir = path.join(home, ".config", "systemd", "user");
  const janitorService = path.join(unitDir, "janitor-record.service");
  const janitorTimer = path.join(unitDir, "janitor-record.timer");
  const collectService = path.join(unitDir, "collect-status.service");
  const collectTimer = path.join(unitDir, "collect-status.timer");
  const janitorInstalledPath = path.join(home, ".agents", "janitor", "installed.json");
  const collectInstalledPath = path.join(home, ".agents", "collect", "installed.json");
  for (const f of [janitorService, janitorTimer, collectService, collectTimer, janitorInstalledPath, collectInstalledPath]) {
    assert.ok(fs.existsSync(f), `expected ${f} to exist before --remove`);
  }

  const cap = capture();
  const code = main(["--remove", "--json", "--job", "collect-status"], { home, env, platform: "linux", pluginRoot, ...cap });
  assert.equal(code, 0, cap.text());

  assert.ok(!fs.existsSync(collectService), "collect-status.service must be removed");
  assert.ok(!fs.existsSync(collectTimer), "collect-status.timer must be removed");
  assert.ok(!fs.existsSync(collectInstalledPath), "the collect job's own installed.json must be removed");

  assert.ok(fs.existsSync(janitorService), "the janitor's service must be left alone");
  assert.ok(fs.existsSync(janitorTimer), "the janitor's timer must be left alone");
  assert.ok(fs.existsSync(janitorInstalledPath), "the janitor's own installed.json must be left alone");
});

test("C2 review round 1, M1: a collect-status install/remove sharing the janitor's own --name must never touch the janitor's units — each job gets its own marker", () => {
  const home = mkTmp("janitor-timer-home-m1-marker-");
  fixtureDefaultRepoGit(home);
  const pluginRoot = fixturePluginRoot();
  const env = { XDG_CONFIG_HOME: path.join(home, ".config") };
  const unitDir = path.join(home, ".config", "systemd", "user");
  const janitorService = path.join(unitDir, "janitor-record.service");
  const janitorTimer = path.join(unitDir, "janitor-record.timer");
  const janitorInstalledPath = path.join(home, ".agents", "janitor", "installed.json");

  // Install the janitor first (its default name), exactly as any real host would.
  main(["--force-root", "--json"], { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, ...capture() });
  const janitorServiceBefore = fs.readFileSync(janitorService, "utf8");
  const janitorTimerBefore = fs.readFileSync(janitorTimer, "utf8");
  const janitorInstalledBefore = fs.readFileSync(janitorInstalledPath, "utf8");

  // A collect-status install that reuses the janitor's own --name must be refused, not silently
  // overwrite the janitor's own unit/timer files — before the fix, both jobs shared one marker
  // string, so `content.includes(MARKER)` treated the janitor's files as the collect job's own.
  const capInstall = capture();
  const codeInstall = main(
    ["--force-root", "--json", "--job", "collect-status", "--to", "skills-fable", "--name", "janitor-record"],
    { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, ...capInstall },
  );
  assert.equal(codeInstall, 1, capInstall.text());
  const installResult = JSON.parse(capInstall.text());
  assert.ok(
    installResult.refusals.some((r) => r.includes("foreign (unmarked) file(s) present")),
    JSON.stringify(installResult.refusals),
  );
  assert.equal(fs.readFileSync(janitorService, "utf8"), janitorServiceBefore, "the janitor's service must be byte-identical");
  assert.equal(fs.readFileSync(janitorTimer, "utf8"), janitorTimerBefore, "the janitor's timer must be byte-identical");
  assert.equal(fs.readFileSync(janitorInstalledPath, "utf8"), janitorInstalledBefore, "the janitor's installed.json must be byte-identical");

  // The twin case: `--remove --enable --job collect-status --name janitor-record` must refuse
  // outright rather than remove (and, with --enable, disable/unload) the janitor's own live units.
  const capRemove = capture();
  const codeRemove = main(
    ["--remove", "--enable", "--json", "--job", "collect-status", "--name", "janitor-record"],
    { home, env, platform: "linux", pluginRoot, ...capRemove },
  );
  assert.equal(codeRemove, 1, capRemove.text());
  const removeResult = JSON.parse(capRemove.text());
  assert.ok(
    removeResult.refusals.some((r) => r.includes("foreign (unmarked) file(s) present")),
    JSON.stringify(removeResult.refusals),
  );
  assert.ok(fs.existsSync(janitorService), "the janitor's service must still exist");
  assert.ok(fs.existsSync(janitorTimer), "the janitor's timer must still exist");
  assert.equal(fs.readFileSync(janitorService, "utf8"), janitorServiceBefore, "the janitor's service must be byte-identical");
  assert.equal(fs.readFileSync(janitorTimer, "utf8"), janitorTimerBefore, "the janitor's timer must be byte-identical");
  assert.equal(fs.readFileSync(janitorInstalledPath, "utf8"), janitorInstalledBefore, "the janitor's installed.json must be byte-identical");
});

test("C2: --job collect-status refuses when collect-status.mjs is missing from the plugin root — job-scoped, distinct from the janitor's own missing-script message", () => {
  const home = mkTmp("janitor-timer-home-collect-noscript-");
  fixtureDefaultRepoGit(home);
  const pluginRoot = mkTmp("janitor-timer-plugin-nocollect-");
  fs.mkdirSync(path.join(pluginRoot, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(pluginRoot, "scripts", "janitor.mjs"), "// stub\n"); // no collect-status.mjs
  const cap = capture();
  const code = main(["--force-root", "--json", "--job", "collect-status", "--to", "x"], { home, platform: "linux", execPath: "/usr/bin/node", pluginRoot, ...cap });
  assert.equal(code, 1);
  const result = JSON.parse(cap.text());
  assert.ok(result.refusals.some((r) => r.includes("missing collect-status script")), JSON.stringify(result.refusals));
  assert.ok(!fs.existsSync(path.join(home, ".agents")));
});

test("C2 review round 2, N1: on Windows, --name reuse across jobs is refused before any write or exec (Task Scheduler's single task-name namespace)", () => {
  const home = mkTmp("janitor-timer-home-n1-win32-");
  fixtureDefaultRepoGit(home);
  const pluginRoot = fixturePluginRoot();
  const calls = [];
  const fakeExec = (cmd, args) => { calls.push([cmd, ...args].join(" ")); return ""; };

  // Install the janitor first, --enable, on win32 (its default name janitor-record).
  const capJanitor = capture();
  const codeJanitor = main(["--force-root", "--json", "--enable"], {
    home, platform: "win32", execPath: "C:\\node\\node.exe", pluginRoot, exec: fakeExec, ...capJanitor,
  });
  assert.equal(codeJanitor, 0, capJanitor.text());
  calls.length = 0;
  const janitorTaskXml = path.join(home, ".agents", "janitor", "janitor-record.task.xml");
  const janitorInstalledPath = path.join(home, ".agents", "janitor", "installed.json");
  const janitorXmlBefore = fs.readFileSync(janitorTaskXml, "utf8");
  const janitorInstalledBefore = fs.readFileSync(janitorInstalledPath, "utf8");

  // Before the fix: an install of the collect job under the janitor's own --name would run
  // `schtasks /Create /TN janitor-record /XML <home>/.agents/collect/janitor-record.task.xml /F`,
  // replacing the janitor's live scheduled task, because the marker check only ever looks at the
  // CURRENT job's own artifact directory and never sees the other job's task.
  const capInstall = capture();
  const codeInstall = main(
    ["--force-root", "--json", "--enable", "--job", "collect-status", "--to", "skills-fable", "--name", "janitor-record"],
    { home, platform: "win32", execPath: "C:\\node\\node.exe", pluginRoot, exec: fakeExec, ...capInstall },
  );
  assert.equal(codeInstall, 1, capInstall.text());
  const installResult = JSON.parse(capInstall.text());
  assert.ok(
    installResult.refusals.some((r) => r.includes("is already the janitor-record job's scheduled task")),
    JSON.stringify(installResult.refusals),
  );
  assert.equal(calls.length, 0, "no exec call must run before the refusal");
  assert.equal(fs.readFileSync(janitorTaskXml, "utf8"), janitorXmlBefore, "the janitor's task xml must be byte-identical");
  assert.equal(fs.readFileSync(janitorInstalledPath, "utf8"), janitorInstalledBefore, "the janitor's installed.json must be byte-identical");
  assert.ok(!fs.existsSync(path.join(home, ".agents", "collect", "janitor-record.task.xml")), "no collect task xml must be written");

  // The twin case: `--remove --enable --job collect-status --name janitor-record` used to run
  // `schtasks /Delete /TN janitor-record /F`, deleting the janitor's live task.
  const capRemove = capture();
  const codeRemove = main(
    ["--remove", "--enable", "--json", "--job", "collect-status", "--name", "janitor-record"],
    { home, platform: "win32", pluginRoot, exec: fakeExec, ...capRemove },
  );
  assert.equal(codeRemove, 1, capRemove.text());
  const removeResult = JSON.parse(capRemove.text());
  assert.ok(
    removeResult.refusals.some((r) => r.includes("is already the janitor-record job's scheduled task")),
    JSON.stringify(removeResult.refusals),
  );
  assert.equal(calls.length, 0, "no exec call must run before the refusal");
  assert.ok(fs.existsSync(janitorTaskXml), "the janitor's task must still exist");
  assert.equal(fs.readFileSync(janitorTaskXml, "utf8"), janitorXmlBefore, "the janitor's task xml must be byte-identical");

  // Reverse direction: with a collect job installed under its own default name, a default-job
  // `--remove --enable --name collect-status` used to run `schtasks /Delete /TN collect-status /F`,
  // deleting the collect job's live task.
  const home2 = mkTmp("janitor-timer-home-n1-win32-reverse-");
  fixtureDefaultRepoGit(home2);
  const pluginRoot2 = fixturePluginRoot();
  const calls2 = [];
  const fakeExec2 = (cmd, args) => { calls2.push([cmd, ...args].join(" ")); return ""; };
  main(["--force-root", "--json", "--enable", "--job", "collect-status", "--to", "skills-fable"], {
    home: home2, platform: "win32", execPath: "C:\\node\\node.exe", pluginRoot: pluginRoot2, exec: fakeExec2, ...capture(),
  });
  calls2.length = 0;
  const collectTaskXml = path.join(home2, ".agents", "collect", "collect-status.task.xml");
  const collectXmlBefore = fs.readFileSync(collectTaskXml, "utf8");
  const capReverse = capture();
  const codeReverse = main(
    ["--remove", "--enable", "--json", "--name", "collect-status"],
    { home: home2, platform: "win32", pluginRoot: pluginRoot2, exec: fakeExec2, ...capReverse },
  );
  assert.equal(codeReverse, 1, capReverse.text());
  const reverseResult = JSON.parse(capReverse.text());
  assert.ok(
    reverseResult.refusals.some((r) => r.includes("is already the collect-status job's scheduled task")),
    JSON.stringify(reverseResult.refusals),
  );
  assert.equal(calls2.length, 0, "no exec call must run before the refusal");
  assert.equal(fs.readFileSync(collectTaskXml, "utf8"), collectXmlBefore, "the collect job's task xml must be byte-identical");
});

function fixtureTriageSkill(home, writer = "BEN-DESKTOP") {
  const file = path.join(home, ".claude", "skills", "triage", "SKILL.md");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `# Triage\n\n## Designated writer boundary\n\nCurated knowledge publication has one designated writer: Windows host\n\`${writer}\`.\n`);
  return file;
}

test("Lane40: knowledge-triage command and XML pin disabled first run, interactive token, and PT2H", () => {
  const inputs = {
    node: "C:\\node\\node.exe",
    pluginRoot: "C:\\plugin",
    repo: "C:\\repo",
    host: "BEN-DESKTOP",
    hour: 5,
    startDate: "2026-10-05",
    logPath: "C:\\Users\\x\\.agents\\knowledge-triage\\last-run.log",
    name: "knowledge-triage",
    job: "knowledge-triage",
  };
  assert.deepEqual(scheduledCommandArgv(inputs), [
    inputs.node,
    path.join(inputs.pluginRoot, "scripts", "knowledge-triage.mjs"),
  ]);
  const xml = windowsTaskXml(inputs);
  assert.match(xml, /<StartBoundary>2026-10-05T05:00:00<\/StartBoundary>/);
  assert.match(xml, /<LogonType>InteractiveToken<\/LogonType>/);
  assert.match(xml, /<ExecutionTimeLimit>PT2H<\/ExecutionTimeLimit>/);
  assert.match(xml, /<Enabled>false<\/Enabled>/);
  assert.equal((xml.match(/<Enabled>false<\/Enabled>/g) || []).length >= 1, true);
});

test("Lane40: the other two jobs keep their generated bytes after the third job is added", () => {
  const common = {
    node: "/usr/bin/node", pluginRoot: "/opt/plugin", repo: "/home/x/Code/claude-delegation",
    host: "hostA", hour: 6, every: 15, staleHours: 2, to: "skills-fable",
    logPath: "/home/x/.agents/job/last-run.log", name: "janitor-record", label: "com.delegation.janitor-record",
  };
  const janitor = {
    argv: scheduledCommandArgv(common),
    service: systemdServiceUnit(common), timer: systemdTimerUnit(common),
    task: windowsTaskXml(common), plist: launchdPlist(common),
    installed: installedJsonText({ ...common, scheduler: "systemd-user" }),
  };
  const collectInputs = { ...common, job: "collect-status", name: "collect-status", label: "com.delegation.collect-status" };
  const collect = {
    argv: scheduledCommandArgv(collectInputs),
    service: systemdServiceUnit(collectInputs), timer: systemdTimerUnit(collectInputs),
    task: windowsTaskXml(collectInputs), plist: launchdPlist(collectInputs),
    installed: installedJsonText({ ...collectInputs, scheduler: "systemd-user" }),
  };
  windowsTaskXml({ ...common, job: "knowledge-triage", name: "knowledge-triage", startDate: "2026-10-05" });
  assert.deepEqual({
    argv: scheduledCommandArgv(common),
    service: systemdServiceUnit(common), timer: systemdTimerUnit(common),
    task: windowsTaskXml(common), plist: launchdPlist(common),
    installed: installedJsonText({ ...common, scheduler: "systemd-user" }),
  }, janitor);
  assert.deepEqual({
    argv: scheduledCommandArgv(collectInputs),
    service: systemdServiceUnit(collectInputs), timer: systemdTimerUnit(collectInputs),
    task: windowsTaskXml(collectInputs), plist: launchdPlist(collectInputs),
    installed: installedJsonText({ ...collectInputs, scheduler: "systemd-user" }),
  }, collect);
});

test("Lane40: Windows install registers disabled, queries, enables, then launches immediately", () => {
  const home = mkTmp("janitor-timer-home-triage-sequence-");
  fixtureDefaultRepoGit(home);
  fixtureTriageSkill(home);
  const pluginRoot = fixturePluginRoot();
  const calls = [];
  const cap = capture();
  const code = main([
    "--force-root", "--json", "--enable", "--job", "knowledge-triage",
    "--hour", "5", "--first-run", "2026-10-05",
  ], {
    home, platform: "win32", execPath: "C:\\node\\node.exe", pluginRoot,
    hostname: () => "BEN-DESKTOP",
    exec: (cmd, args) => { calls.push([cmd, ...args]); return "fixture query output"; },
    ...cap,
  });
  assert.equal(code, 0, cap.text());
  assert.deepEqual(calls.map((call) => call.slice(0, 3).map((part) => String(part).toLowerCase())), [
    ["schtasks", "/create", "/tn"],
    ["schtasks", "/query", "/tn"],
    ["schtasks", "/change", "/tn"],
    ["schtasks", "/run", "/tn"],
  ]);
  const xmlPath = path.join(home, ".agents", "knowledge-triage", "knowledge-triage.task.xml");
  const bytes = fs.readFileSync(xmlPath);
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xfe);
  const xml = bytes.subarray(2).toString("utf16le");
  assert.match(xml, /<Enabled>false<\/Enabled>/);
  assert.match(xml, /<ExecutionTimeLimit>PT2H<\/ExecutionTimeLimit>/);
});

test("Lane40: --first-run refuses missing and invalid calendar dates before writes", () => {
  for (const [label, tail] of [
    ["missing", ["--first-run"]],
    ["malformed", ["--first-run", "2026-2-03"]],
    ["impossible", ["--first-run", "2026-02-30"]],
  ]) {
    const home = mkTmp(`janitor-timer-home-triage-first-run-${label}-`);
    fixtureDefaultRepoGit(home);
    fixtureTriageSkill(home);
    const calls = [];
    const cap = capture();
    const code = main(["--force-root", "--json", "--job", "knowledge-triage", ...tail], {
      home, platform: "win32", execPath: "C:\\node\\node.exe", pluginRoot: fixturePluginRoot(),
      hostname: () => "BEN-DESKTOP", exec: (...args) => calls.push(args), ...cap,
    });
    assert.equal(code, 1, `${label}: ${cap.text()}`);
    const result = JSON.parse(cap.text());
    assert.ok(
      result.refusals.some((reason) => reason.includes("--first-run must be a calendar date YYYY-MM-DD")),
      `${label}: ${JSON.stringify(result.refusals)}`,
    );
    assert.equal(calls.length, 0, `${label}: scheduler command must not run`);
    assert.ok(!fs.existsSync(path.join(home, ".agents", "knowledge-triage")), `${label}: installer must not write`);
  }
});

test("Lane40: installer refuses a nonwriter with exit 2 before writes or scheduler calls", () => {
  const home = mkTmp("janitor-timer-home-triage-nonwriter-");
  fixtureDefaultRepoGit(home);
  fixtureTriageSkill(home);
  const calls = [];
  const cap = capture();
  const code = main(["--force-root", "--json", "--job", "knowledge-triage"], {
    home, platform: "win32", execPath: "C:\\node\\node.exe", pluginRoot: fixturePluginRoot(),
    hostname: () => "OTHER-HOST", exec: (...args) => calls.push(args), ...cap,
  });
  assert.equal(code, 2);
  assert.match(cap.text(), /knowledge-triage installs only on the writer host BEN-DESKTOP/i);
  assert.equal(calls.length, 0);
  assert.ok(!fs.existsSync(path.join(home, ".agents", "knowledge-triage")));
});

test("Lane40: removing triage leaves janitor and collect job artifacts byte-identical", () => {
  const home = mkTmp("janitor-timer-home-triage-remove-");
  fixtureDefaultRepoGit(home);
  fixtureTriageSkill(home);
  const pluginRoot = fixturePluginRoot();
  const exec = () => "";
  const base = { home, platform: "win32", execPath: "C:\\node\\node.exe", pluginRoot, exec, hostname: () => "BEN-DESKTOP" };
  assert.equal(main(["--force-root", "--json"], { ...base, ...capture() }), 0);
  assert.equal(main(["--force-root", "--json", "--job", "collect-status", "--to", "skills-fable"], { ...base, ...capture() }), 0);
  assert.equal(main(["--force-root", "--json", "--job", "knowledge-triage", "--first-run", "2026-10-05"], { ...base, ...capture() }), 0);
  const janitorDir = path.join(home, ".agents", "janitor");
  const collectDir = path.join(home, ".agents", "collect");
  const before = new Map();
  for (const dir of [janitorDir, collectDir]) {
    for (const name of fs.readdirSync(dir)) before.set(path.join(dir, name), fs.readFileSync(path.join(dir, name)));
  }
  const cap = capture();
  assert.equal(main(["--remove", "--json", "--job", "knowledge-triage"], { ...base, ...cap }), 0, cap.text());
  assert.ok(!fs.existsSync(path.join(home, ".agents", "knowledge-triage", "knowledge-triage.task.xml")));
  for (const [file, bytes] of before) assert.deepEqual(fs.readFileSync(file), bytes, file);
});

test("C2 review round 2, N2: --remove --job collect-status without --to must not throw on darwin or win32 (launchdPlist argv coercion)", () => {
  for (const platform of ["darwin", "win32"]) {
    const home = mkTmp(`janitor-timer-home-n2-${platform}-`);
    fixtureDefaultRepoGit(home);
    const pluginRoot = fixturePluginRoot();
    const execPath = platform === "darwin" ? "/usr/local/bin/node" : "C:\\node\\node.exe";

    // Install first (--to is required for an install).
    const capInstall = capture();
    const codeInstall = main(
      ["--force-root", "--json", "--job", "collect-status", "--to", "skills-fable"],
      { home, platform, execPath, pluginRoot, ...capInstall },
    );
    assert.equal(codeInstall, 0, capInstall.text());

    const agentsDir = path.join(home, ".agents", "collect");
    const installedPath = path.join(agentsDir, "installed.json");
    const artifactPath = platform === "darwin"
      ? path.join(home, "Library", "LaunchAgents", "com.delegation.collect-status.plist")
      : path.join(agentsDir, "collect-status.task.xml");
    assert.ok(fs.existsSync(installedPath), `installed.json must exist after install on ${platform}`);
    assert.ok(fs.existsSync(artifactPath), `the scheduled artifact must exist after install on ${platform}`);

    // Before the fix: on darwin, `launchdPlist`'s `.map((a) => a.replace(...))` threw
    // `TypeError: Cannot read properties of null (reading 'replace')` because the remove path's
    // `to` is null and every argv element was assumed to already be a string.
    const capRemove = capture();
    const codeRemove = main(
      ["--remove", "--json", "--job", "collect-status"],
      { home, platform, pluginRoot, ...capRemove },
    );
    assert.equal(codeRemove, 0, capRemove.text());
    assert.ok(!fs.existsSync(installedPath), `installed.json must be removed on ${platform}`);
    assert.ok(!fs.existsSync(artifactPath), `the scheduled artifact must be removed on ${platform}`);
  }
});

after(() => {
  for (const dir of tracked) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort cleanup of this file's own fixtures */ }
  }
});
