// node --test scripts/collect-status.test.mjs
//
// The fixture builders below (mkTmp, writeRecord, commitAll, initRepoWithOrigin, newBranch,
// pushBranch, backToMain, snapshotGitDir) are COPIED from collect-from-origin.test.mjs, not
// imported: collect-from-origin.test.mjs does not export them, and moving them into a shared
// fixture module would touch a file outside this territory. They are the same code and the same
// never-writes model, just duplicated rather than reused; flagged as a deviation in reports/C1.md.
// Every mkdtemp'd directory is tracked and removed in one after() hook, same convention as
// collect-from-origin.test.mjs.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

import {
  main,
  parseArgs,
  defaultOutDir,
  sanitizeHost,
  computeByState,
  computeChangeKey,
  computeAttention,
  resolveNoteSend,
  buildStatusMd,
} from "./collect-status.mjs";

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

const tracked = [];
function mkTmp(prefix) {
  const dir = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), prefix));
  tracked.push(dir);
  return dir;
}

function writeRecord(root, filename, lines) {
  const dir = path.join(root, "docs", "work");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), lines.join("\n"));
  return path.posix.join("docs", "work", filename);
}

function commitAll(root, msg) {
  git(["add", "."], root);
  git(["commit", "-q", "-m", msg], root);
}

function initRepoWithOrigin() {
  const root = mkTmp("cstatus-repo-");
  git(["init", "-q", "-b", "main"], root);
  fs.writeFileSync(path.join(root, "README.md"), "root\n");
  commitAll(root, "init");
  const bare = mkTmp("cstatus-origin-");
  git(["init", "-q", "--bare", "-b", "main"], bare);
  git(["remote", "add", "origin", bare], root);
  git(["push", "-q", "origin", "main"], root);
  return root;
}

function newBranch(root, name) {
  git(["checkout", "-q", "-b", name], root);
}

function pushBranch(root, name) {
  git(["push", "-q", "origin", name], root);
}

function backToMain(root) {
  git(["checkout", "-q", "main"], root);
}

// Walks the WHOLE repo (working tree and .git both), not just .git: the spec forbids any write
// under the repo, not only a git write, so the never-writes assertion has to cover both.
function snapshotGitDir(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(root);
  return files
    .sort()
    .map((f) => `${path.relative(root, f)}:${crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex")}`);
}

function outTmp() {
  return mkTmp("cstatus-out-");
}

function fakeSpawnCounter() {
  const calls = [];
  const fn = (execPath, args) => {
    calls.push({ execPath, args });
    return { status: 0, stdout: "ok\n", stderr: "" };
  };
  fn.calls = calls;
  return fn;
}

const alwaysNoteSend = () => "/usr/bin/note-send-stub";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test("parseArgs: defaults and every flag", () => {
  const a = parseArgs([
    "--repo", "/r", "--main", "origin/trunk", "--no-fetch", "--skip", "x", "--skip", "y",
    "--out", "/o", "--to", "lead", "--host", "Netcup!!", "--merge-hours", "2", "--stale-hours", "3", "--quiet",
  ]);
  assert.equal(a.repo, "/r");
  assert.equal(a.main, "origin/trunk");
  assert.equal(a.noFetch, true);
  assert.deepEqual(a.skip, ["x", "y"]);
  assert.equal(a.out, "/o");
  assert.equal(a.to, "lead");
  assert.equal(a.host, "Netcup!!");
  assert.equal(a.mergeHours, 2);
  assert.equal(a.staleHours, 3);
  assert.equal(a.quiet, true);

  const d = parseArgs([]);
  assert.equal(d.main, "origin/main");
  assert.equal(d.noFetch, false);
  assert.deepEqual(d.skip, []);
  assert.equal(d.mergeHours, 4);
  assert.equal(d.staleHours, 6);
  assert.equal(d.quiet, false);
});

test("defaultOutDir: ~/.agents/collect/<basename of repo>", () => {
  assert.equal(defaultOutDir("/home/ben", "/home/ben/Code/claude-delegation"), "/home/ben/.agents/collect/claude-delegation");
});

test("sanitizeHost: replaces, collapses, trims, cuts to 40; empty result -> host", () => {
  assert.equal(sanitizeHost("Netcup-01"), "netcup-01");
  assert.equal(sanitizeHost("My Host!!"), "my-host");
  assert.equal(sanitizeHost("--weird--"), "weird");
  assert.equal(sanitizeHost("!!!"), "host");
  assert.equal(sanitizeHost(""), "host");
  assert.equal(sanitizeHost("a".repeat(50)), "a".repeat(40));
});

test("computeByState: counts rows per state", () => {
  const rows = [{ state: "owned" }, { state: "owned" }, { state: "no-record" }];
  assert.deepEqual(computeByState(rows), { owned: 2, "no-record": 1 });
});

test("computeChangeKey: order-independent (sorted), sensitive to any field change", () => {
  const a = [{ branch: "b1", recordPath: "p1", state: "owned", tipSha: "s1" }, { branch: "b2", recordPath: "p2", state: "owned", tipSha: "s2" }];
  const aReordered = [a[1], a[0]];
  assert.equal(computeChangeKey(a), computeChangeKey(aReordered));
  const changed = [a[0], { ...a[1], tipSha: "different" }];
  assert.notEqual(computeChangeKey(a), computeChangeKey(changed));
});

test("computeAttention: accepted-unmerged boundary (over merge-hours only)", () => {
  const now = Date.parse("2026-09-27T12:00:00Z");
  const justUnder = new Date(now - 4 * 3_600_000).toISOString(); // exactly 4h old: not over
  const over = new Date(now - 4 * 3_600_000 - 1000).toISOString(); // 4h + 1s: over
  const rows = [
    { branch: "b-under", recordPath: "p1", state: "accepted-unmerged", tipDate: justUnder, hoursSinceLog: null },
    { branch: "b-over", recordPath: "p2", state: "accepted-unmerged", tipDate: over, hoursSinceLog: null },
  ];
  const attn = computeAttention(rows, 4, 6, now);
  assert.deepEqual(attn, [{ branch: "b-over", recordPath: "p2", state: "accepted-unmerged", reason: "accepted-unmerged-over-4-h" }]);
});

test("computeAttention: owned + hoursSinceLog boundary (silent-over-N-h)", () => {
  const rows = [
    { branch: "b1", recordPath: "p1", state: "owned", tipDate: null, hoursSinceLog: 6 }, // not over (>)
    { branch: "b2", recordPath: "p2", state: "owned", tipDate: null, hoursSinceLog: 6.01 },
  ];
  const attn = computeAttention(rows, 4, 6, Date.now());
  assert.deepEqual(attn, [{ branch: "b2", recordPath: "p2", state: "owned", reason: "silent-over-6-h" }]);
});

test("computeAttention: no-record always flagged; unparseable tipDate never confidently flagged", () => {
  const rows = [
    { branch: "b1", recordPath: null, state: "no-record", tipDate: null, hoursSinceLog: null },
    { branch: "b2", recordPath: "p2", state: "accepted-unmerged", tipDate: "not-a-date", hoursSinceLog: null },
  ];
  const attn = computeAttention(rows, 4, 6, Date.now());
  assert.deepEqual(attn, [{ branch: "b1", recordPath: null, state: "no-record", reason: "no-record" }]);
});

test("resolveNoteSend: prefers ~/.local/bin/note-send when executable, else PATH, else null", () => {
  const home = mkTmp("cstatus-home-");
  const binDir = path.join(home, ".local", "bin");
  fs.mkdirSync(binDir, { recursive: true });
  const localNoteSend = path.join(binDir, "note-send");
  fs.writeFileSync(localNoteSend, "#!/bin/sh\n");
  fs.chmodSync(localNoteSend, 0o755);
  assert.equal(resolveNoteSend(home, { PATH: "" }), localNoteSend);

  const home2 = mkTmp("cstatus-home-");
  const pathDir = mkTmp("cstatus-pathdir-");
  const onPath = path.join(pathDir, "note-send");
  fs.writeFileSync(onPath, "#!/bin/sh\n");
  fs.chmodSync(onPath, 0o755);
  assert.equal(resolveNoteSend(home2, { PATH: pathDir }), onPath);

  const home3 = mkTmp("cstatus-home-");
  assert.equal(resolveNoteSend(home3, { PATH: "" }), null);
});

test("buildStatusMd: header carries fetch: failed only on failure; attention first, then formatTable's table", () => {
  const status = {
    generatedAt: "2026-09-27T18:20:00.000Z",
    main: { ref: "origin/main", sha: "a".repeat(40) },
    rows: [{ branch: "b1", tipSha: "a".repeat(40), tipDate: "2026-09-27T00:00:00Z", recordPath: "p", status: "owned", artifactSha: null, merged: null, hoursSinceLog: 1, state: "owned" }],
    summary: { byState: { owned: 1 }, attention: [{ branch: "b1", recordPath: "p", state: "owned", reason: "silent-over-6-h" }] },
  };
  const md = buildStatusMd({ status, fetchStatus: "ok", sendOutcome: { attempted: false, sent: false, reason: null } });
  const lines = md.split("\n");
  assert.match(lines[0], /generatedAt: 2026-09-27T18:20:00\.000Z \(.*America\/New_York\) \| main: a{40} \| rows: 1/);
  assert.ok(!lines[0].includes("fetch: failed"));
  assert.equal(lines[1], "attention (1)");
  assert.equal(lines[2], "- b1\tp\towned\tsilent-over-6-h");
  assert.ok(lines[3].startsWith("branch\ttipSha\t")); // formatTable's own header row

  const failedMd = buildStatusMd({ status, fetchStatus: "failed", sendOutcome: { attempted: false, sent: false, reason: null } });
  assert.ok(failedMd.split("\n")[0].includes("fetch: failed"));
});

test("buildStatusMd: 40 no-record rows still fit the 60-line budget, and the cut is marked", () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({
    branch: `feature/many-${i}`, tipSha: "a".repeat(40), tipDate: null, recordPath: null,
    status: "no-record", artifactSha: null, merged: null, hoursSinceLog: null, state: "no-record",
  }));
  const attention = rows.map((r) => ({ branch: r.branch, recordPath: r.recordPath, state: r.state, reason: "no-record" }));
  const status = {
    generatedAt: "2026-09-27T18:20:00.000Z",
    main: { ref: "origin/main", sha: "a".repeat(40) },
    rows,
    summary: { byState: { "no-record": 40 }, attention },
  };
  const md = buildStatusMd({ status, fetchStatus: "ok", sendOutcome: { attempted: false, sent: false, reason: null } });
  const lineCount = md.split("\n").length - 1; // every line, not just non-empty ones
  assert.ok(lineCount <= 60, `status.md is ${lineCount} lines`);
  assert.match(md, /\(\+\d+ more, see status\.json\)/);
  // attention (n) still reports the TRUE total, even though the entry list itself is capped.
  assert.ok(md.includes("attention (40)"));
});

// ---------------------------------------------------------------------------
// Integration: main() against a real bare-remote fixture
// ---------------------------------------------------------------------------

test("status.json shape: generatedAt/host/repo/fetch/main/rows/summary/changeKey/announced", () => {
  const root = initRepoWithOrigin();
  newBranch(root, "feature/one");
  const rec = writeRecord(root, "wr-2026-09-27-one.record.md", ["Work: wr-2026-09-27-one", "Status: owned", "Artifact: none", ""]);
  commitAll(root, "one record");
  pushBranch(root, "feature/one");
  backToMain(root);

  const out = outTmp();
  const written = [];
  const code = main(["--repo", root, "--no-fetch", "--out", out, "--quiet"], { write: (s) => written.push(s) });
  assert.equal(code, 0);

  const status = JSON.parse(fs.readFileSync(path.join(out, "status.json"), "utf8"));
  assert.equal(typeof status.generatedAt, "string");
  assert.ok(!Number.isNaN(Date.parse(status.generatedAt)));
  assert.equal(typeof status.host, "string");
  assert.equal(status.repo, root);
  assert.equal(status.fetch, "skipped");
  assert.equal(status.main.ref, "origin/main");
  assert.equal(typeof status.main.sha, "string");
  assert.equal(status.rows.length, 1);
  assert.equal(status.rows[0].recordPath, rec);
  assert.deepEqual(status.summary.byState, { owned: 1 });
  assert.deepEqual(status.summary.attention, []);
  assert.equal(typeof status.changeKey, "string");
  assert.equal(status.announced, status.changeKey); // first run: attempted (quiet), so announced updates
  assert.ok(fs.existsSync(path.join(out, "status.md")));
  assert.equal(fs.existsSync(path.join(out, "previous.json")), false); // first run: nothing to rotate
});

test("change key equal across two runs with no repo change: zero note-send calls", () => {
  const root = initRepoWithOrigin();
  newBranch(root, "feature/stable");
  writeRecord(root, "wr-2026-09-27-stable.record.md", ["Work: wr-2026-09-27-stable", "Status: owned", "Artifact: none", ""]);
  commitAll(root, "stable record");
  pushBranch(root, "feature/stable");
  backToMain(root);

  const out = outTmp();
  const spawn = fakeSpawnCounter();
  const opts = { spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend };

  main(["--repo", root, "--no-fetch", "--out", out, "--to", "lead"], opts);
  assert.equal(spawn.calls.length, 1, "first run: previous.json absent, key differs -> one send");

  main(["--repo", root, "--no-fetch", "--out", out, "--to", "lead"], opts);
  assert.equal(spawn.calls.length, 1, "second run: same key -> no additional send");

  const status = JSON.parse(fs.readFileSync(path.join(out, "status.json"), "utf8"));
  assert.ok(fs.existsSync(path.join(out, "previous.json")));
  assert.equal(status.announced, status.changeKey);
});

test("change key different: exactly one call, kind RESULT, --no-type present", () => {
  const root = initRepoWithOrigin();
  const out = outTmp();
  const spawn = fakeSpawnCounter();
  const opts = { spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend };

  main(["--repo", root, "--no-fetch", "--out", out, "--to", "lead"], opts); // no branches yet: first run still sends once
  assert.equal(spawn.calls.length, 1);

  newBranch(root, "feature/new");
  writeRecord(root, "wr-2026-09-27-new.record.md", ["Work: wr-2026-09-27-new", "Status: owned", "Artifact: none", ""]);
  commitAll(root, "new record");
  pushBranch(root, "feature/new");
  backToMain(root);

  main(["--repo", root, "--no-fetch", "--out", out, "--to", "lead"], opts);
  assert.equal(spawn.calls.length, 2, "rows changed: a second send");
  const [, second] = spawn.calls;
  assert.ok(second.args.includes("--kind"));
  assert.equal(second.args[second.args.indexOf("--kind") + 1], "RESULT");
  assert.ok(second.args.includes("--no-type"));
  assert.ok(second.args.includes("--needs"));
  assert.equal(second.args[second.args.indexOf("--needs") + 1], "none");
  assert.ok(second.args.includes("--to"));
  assert.equal(second.args[second.args.indexOf("--to") + 1], "lead");
});

test("--quiet: key differs but note-send is never invoked; status still written", () => {
  const root = initRepoWithOrigin();
  const out = outTmp();
  const spawn = fakeSpawnCounter();
  main(["--repo", root, "--no-fetch", "--out", out, "--to", "lead", "--quiet"], {
    spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend,
  });
  assert.equal(spawn.calls.length, 0);
  const md = fs.readFileSync(path.join(out, "status.md"), "utf8");
  assert.ok(md.includes("note: skipped, --quiet"));
  const status = JSON.parse(fs.readFileSync(path.join(out, "status.json"), "utf8"));
  assert.equal(status.announced, status.changeKey); // quiet still counts as attempted
});

test("missing note-send on PATH: writes status anyway, exits 0, says so in status.md", () => {
  const root = initRepoWithOrigin();
  const out = outTmp();
  const spawn = fakeSpawnCounter();
  const code = main(["--repo", root, "--no-fetch", "--out", out, "--to", "lead"], {
    spawnNoteSend: spawn, resolveNoteSend: () => null,
  });
  assert.equal(code, 0);
  assert.equal(spawn.calls.length, 0);
  const md = fs.readFileSync(path.join(out, "status.md"), "utf8");
  assert.ok(md.includes("note: skipped, note-send missing"));
});

test("missing --to: skips the send, still writes status, still exits 0", () => {
  const root = initRepoWithOrigin();
  const out = outTmp();
  const spawn = fakeSpawnCounter();
  const code = main(["--repo", root, "--no-fetch", "--out", out], { spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend });
  assert.equal(code, 0);
  assert.equal(spawn.calls.length, 0);
  const md = fs.readFileSync(path.join(out, "status.md"), "utf8");
  assert.ok(md.includes("note: skipped, --to missing"));
});

test("atomic write: no temp file left behind under --out after a run", () => {
  const root = initRepoWithOrigin();
  const out = outTmp();
  main(["--repo", root, "--no-fetch", "--out", out, "--quiet"], {});
  const names = fs.readdirSync(out);
  assert.deepEqual(names.sort(), ["status.json", "status.md"]);
  for (const n of names) assert.ok(!n.includes(".tmp-"), `unexpected temp file: ${n}`);
});

test("previous.json rotation: prior status.json is renamed aside, not copied, before the new write", () => {
  const root = initRepoWithOrigin();
  const out = outTmp();
  main(["--repo", root, "--no-fetch", "--out", out, "--quiet"], {});
  const firstStatus = fs.readFileSync(path.join(out, "status.json"), "utf8");

  newBranch(root, "feature/rotate");
  writeRecord(root, "wr-2026-09-27-rotate.record.md", ["Work: wr-2026-09-27-rotate", "Status: owned", "Artifact: none", ""]);
  commitAll(root, "rotate record");
  pushBranch(root, "feature/rotate");
  backToMain(root);

  main(["--repo", root, "--no-fetch", "--out", out, "--quiet"], {});
  const previous = fs.readFileSync(path.join(out, "previous.json"), "utf8");
  assert.equal(previous, firstStatus);
  const second = fs.readFileSync(path.join(out, "status.json"), "utf8");
  assert.notEqual(second, firstStatus);
});

test("fetch failure: still writes a status (fetch: failed), sends no note, never updates announced", () => {
  const root = initRepoWithOrigin();
  const bareRemote = git(["remote", "get-url", "origin"], root).trim();
  git(["remote", "set-url", "origin", path.join(bareRemote, "does-not-exist")], root);

  const out = outTmp();
  const spawn = fakeSpawnCounter();
  const code = main(["--repo", root, "--out", out, "--to", "lead"], { spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend });
  assert.equal(code, 0);
  assert.equal(spawn.calls.length, 0, "a failed fetch never wakes anyone");
  const status = JSON.parse(fs.readFileSync(path.join(out, "status.json"), "utf8"));
  assert.equal(status.fetch, "failed");
  assert.equal(status.announced, null);
  const md = fs.readFileSync(path.join(out, "status.md"), "utf8");
  assert.ok(md.includes("fetch: failed"));
});

test("a failed fetch that sees a change does not swallow it: the next good run announces it", () => {
  const out = outTmp();
  const spawn = fakeSpawnCounter();
  const row = (b) => ({
    branch: b, tipSha: "a".repeat(40), tipDate: "2026-09-27T00:00:00Z", recordPath: `docs/work/${b}.record.md`,
    status: "owned", artifactSha: null, merged: null, hoursSinceLog: 1, state: "owned",
  });
  const collect = (rows, fail) => (argv, o) => {
    if (fail) o.warn("collect-from-origin: git fetch failed, proceeding with local refs: x");
    o.write(JSON.stringify(rows));
    return 0;
  };
  const root = initRepoWithOrigin();
  const base = { spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend };

  main(["--repo", root, "--out", out, "--to", "lead"], { ...base, collectMain: collect([row("b1")], false) });
  main(["--repo", root, "--out", out, "--to", "lead"], { ...base, collectMain: collect([row("b1"), row("b2")], true) });
  assert.equal(spawn.calls.length, 1, "failed fetch: no note");

  main(["--repo", root, "--out", out, "--to", "lead"], { ...base, collectMain: collect([row("b1"), row("b2")], false) });
  assert.equal(spawn.calls.length, 2, "the change seen during the failed fetch is announced on the next good run");
});

test("K2 allowlist: a state outside collect-from-origin's names reaches --text only as other (seam m1)", () => {
  const out = outTmp();
  const spawn = fakeSpawnCounter();
  const rows = [{
    branch: "b1", tipSha: "a".repeat(40), tipDate: "2026-09-27T00:00:00Z", recordPath: "docs/work/b1.record.md",
    status: "owned", artifactSha: null, merged: null, hoursSinceLog: 1, state: "evil;$(id)",
  }];
  const collectMain = (argv, o) => { o.write(JSON.stringify(rows)); return 0; };
  const root = initRepoWithOrigin();
  main(["--repo", root, "--out", out, "--to", "lead"], { spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend, collectMain });
  assert.equal(spawn.calls.length, 1);
  const args = spawn.calls[0].args;
  const text = args[args.indexOf("--text") + 1];
  assert.match(text, /other=1/);
  assert.doesNotMatch(text, /evil/);
});

test("a --main ref that doesn't resolve sends no note (no real state to report)", () => {
  const root = initRepoWithOrigin();
  const out = outTmp();
  const spawn = fakeSpawnCounter();
  const code = main(
    ["--repo", root, "--no-fetch", "--main", "origin/nope", "--out", out, "--to", "lead"],
    { spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend },
  );
  assert.equal(code, 0);
  assert.equal(spawn.calls.length, 0, "an unresolved --main never wakes the lead");
  const md = fs.readFileSync(path.join(out, "status.md"), "utf8");
  assert.ok(md.includes("main: unknown"));
});

test("never writes: every file under .git is byte-identical before and after a --no-fetch run", () => {
  const root = initRepoWithOrigin();
  newBranch(root, "feature/readonly-check");
  writeRecord(root, "wr-2026-09-27-ro.record.md", ["Work: wr-2026-09-27-ro", "Status: owned", "Artifact: none", ""]);
  commitAll(root, "ro record");
  pushBranch(root, "feature/readonly-check");
  backToMain(root);

  const out = outTmp();
  const before = snapshotGitDir(root);
  main(["--repo", root, "--no-fetch", "--out", out, "--quiet"], {});
  const after = snapshotGitDir(root);
  assert.deepEqual(after, before);
});

test("status.md stays within the 60-line budget for a modest fixture", () => {
  const root = initRepoWithOrigin();
  for (let i = 0; i < 5; i++) {
    newBranch(root, `feature/many-${i}`);
    writeRecord(root, `wr-2026-09-27-many-${i}.record.md`, [`Work: wr-2026-09-27-many-${i}`, "Status: owned", "Artifact: none", ""]);
    commitAll(root, `many ${i}`);
    pushBranch(root, `feature/many-${i}`);
    backToMain(root);
  }
  const out = outTmp();
  main(["--repo", root, "--no-fetch", "--out", out, "--quiet"], {});
  const md = fs.readFileSync(path.join(out, "status.md"), "utf8");
  const lineCount = md.split("\n").filter((l) => l.length > 0).length;
  assert.ok(lineCount <= 60, `status.md is ${lineCount} lines`);
});

after(() => {
  // Under scripts/run-tests.mjs every mkTmp'd dir here lives under FIXTURE_ROOT, and
  // makeTempHome's own cleanup() already removes the whole sealed home (fixtureRoot included)
  // once the child process exits (scripts/test-home.mjs). Deleting the same directories again
  // here would be a delete outside the makeTempHome helpers (contracts.md Process); skip it in
  // that case. Run directly (no FIXTURE_ROOT, mkTmp fell back to os.tmpdir()), nothing else
  // cleans these up, so the explicit rmSync stays - same convention as collect-from-origin.test.mjs.
  if (process.env.FIXTURE_ROOT) return;
  for (const dir of tracked) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup only
    }
  }
});
