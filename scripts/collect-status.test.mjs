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
  branchSlug,
  buildStallTopic,
  ownerSlugOrNull,
} from "./collect-status.mjs";
import { timeParts } from "../skills/multi/scripts/envelope.mjs";

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
    "--repo", "/r", "--main", "origin/trunk", "--no-fetch", "--skip", "x", "--skip", "y", "--only-prefix", "build/",
    "--out", "/o", "--to", "lead", "--host", "Netcup!!", "--merge-hours", "2", "--stale-hours", "3", "--quiet",
  ]);
  assert.equal(a.repo, "/r");
  assert.equal(a.main, "origin/trunk");
  assert.equal(a.noFetch, true);
  assert.deepEqual(a.skip, ["x", "y"]);
  assert.deepEqual(a.onlyPrefix, ["build/"]);
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
  assert.deepEqual(d.onlyPrefix, []);
  assert.equal(d.mergeHours, 4);
  assert.equal(d.staleHours, 6);
  assert.equal(d.quiet, false);
});

test("defaultOutDir: ~/.agents/collect/<basename of repo>", () => {
  assert.equal(defaultOutDir("/home/ben", "/home/ben/Code/claude-delegation"), path.join("/home/ben", ".agents", "collect", "claude-delegation"));
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
  assert.ok(lines[3].startsWith("branch\ttipSha\t"));
  assert.ok(lines[3].endsWith("\tlane"));
  assert.equal(lines[4], "lane: every non-terminal Status shows as owned");

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
  newBranch(root, "build/one");
  const rec = writeRecord(root, "wr-2026-09-27-one.record.md", ["Work: wr-2026-09-27-one", "Status: owned", "Artifact: none", ""]);
  commitAll(root, "one record");
  pushBranch(root, "build/one");
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
  assert.deepEqual(status.summary.skipped, { count: 0, prefixes: ["build/"] });
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

  newBranch(root, "build/new");
  writeRecord(root, "wr-2026-09-27-new.record.md", ["Work: wr-2026-09-27-new", "Status: owned", "Artifact: none", ""]);
  commitAll(root, "new record");
  pushBranch(root, "build/new");
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

// ---------------------------------------------------------------------------
// Lane thirty (stall-nudge, docs/specs/stall-nudge-1): pure helpers.
// ---------------------------------------------------------------------------

test("branchSlug: lowercases, collapses every run of non-[a-z0-9] to one '-', trims ends", () => {
  assert.equal(branchSlug("Build/Foo_Bar!!"), "build-foo-bar");
  assert.equal(branchSlug("--x--"), "x");
  assert.equal(branchSlug(""), "");
});

test("buildStallTopic: stall-<branch-slug>-<sha7>; a long branch truncates only the slug, never the sha", () => {
  assert.equal(buildStallTopic("build/foo", "abcdef0123456789"), "stall-build-foo-abcdef0");
  const longBranch = `build/${"x".repeat(80)}`;
  const topic = buildStallTopic(longBranch, "1234567890");
  assert.ok(topic.endsWith("-1234567"), topic);
  assert.ok(topic.length < 6 + branchSlug(longBranch).length + 8, topic);
});

test("ownerSlugOrNull: none/missing/mixed-case/spaced all null; a real slug passes through unchanged", () => {
  assert.equal(ownerSlugOrNull(undefined), null);
  assert.equal(ownerSlugOrNull(null), null);
  assert.equal(ownerSlugOrNull("none"), null);
  assert.equal(ownerSlugOrNull("None"), null);
  assert.equal(ownerSlugOrNull("Not A Slug"), null);
  assert.equal(ownerSlugOrNull("skills-fable"), "skills-fable");
});

// ---------------------------------------------------------------------------
// Lane thirty: the stall ASK itself, against real bare-remote fixtures (spec's acceptance list).
// ---------------------------------------------------------------------------

function checkoutExisting(root, name) {
  git(["checkout", "-q", name], root);
}

test("stall-nudge: one ASK for the 2.1h stale owned row; none for accepted-merged/accepted-unmerged/rejected/withdrawn/no-record or a 1.9h row; argv is exact", () => {
  const root = initRepoWithOrigin();
  const NOW = Date.parse("2026-09-27T12:00:00Z");
  const hoursAgoIso = (h) => new Date(NOW - h * 3_600_000).toISOString();

  // accepted-merged: the artifact commit lands on main first, so it's trivially an ancestor.
  fs.writeFileSync(path.join(root, "artifact-a.txt"), "a\n");
  commitAll(root, "artifact A");
  const artifactA = git(["rev-parse", "HEAD"], root).trim();
  git(["push", "-q", "origin", "main"], root);

  newBranch(root, "build/accepted-merged");
  writeRecord(root, "wr-2026-09-27-am.record.md", [
    "Work: wr-2026-09-27-am", "Owner: leadslug", "Status: accepted",
    `Artifact: scripts/foo.mjs@${artifactA}`, "Log: 2026-09-27T01:00:00Z accepted leadslug note", "",
  ]);
  commitAll(root, "am record");
  pushBranch(root, "build/accepted-merged");
  backToMain(root);

  // accepted-unmerged: never a "silent-over-" reason regardless of its own tipDate age, since
  // computeAttention only ever gives it "accepted-unmerged-over-N-h".
  newBranch(root, "build/accepted-unmerged");
  fs.writeFileSync(path.join(root, "artifact-b.txt"), "b\n");
  commitAll(root, "artifact B");
  const artifactB = git(["rev-parse", "HEAD"], root).trim();
  writeRecord(root, "wr-2026-09-27-au.record.md", [
    "Work: wr-2026-09-27-au", "Owner: leadslug", "Status: accepted",
    `Artifact: ${artifactB}`, "Log: 2026-09-27T01:00:00Z accepted leadslug note", "",
  ]);
  commitAll(root, "au record");
  pushBranch(root, "build/accepted-unmerged");
  backToMain(root);

  newBranch(root, "build/rejected");
  writeRecord(root, "wr-2026-09-27-rejected.record.md", [
    "Work: wr-2026-09-27-rejected", "Owner: leadslug", "Status: rejected", "Artifact: none",
    "Log: 2026-09-27T01:00:00Z rejected leadslug note", "",
  ]);
  commitAll(root, "rejected record");
  pushBranch(root, "build/rejected");
  backToMain(root);

  newBranch(root, "build/withdrawn");
  writeRecord(root, "wr-2026-09-27-withdrawn.record.md", [
    "Work: wr-2026-09-27-withdrawn", "Owner: leadslug", "Status: withdrawn", "Artifact: none",
    "Log: 2026-09-27T01:00:00Z withdrawn leadslug note", "",
  ]);
  commitAll(root, "withdrawn record");
  pushBranch(root, "build/withdrawn");
  backToMain(root);

  newBranch(root, "build/no-record-branch");
  fs.writeFileSync(path.join(root, "unrelated.txt"), "unrelated\n");
  commitAll(root, "no-record work");
  pushBranch(root, "build/no-record-branch");
  backToMain(root);

  newBranch(root, "build/fresh-owned");
  writeRecord(root, "wr-2026-09-27-fresh.record.md", [
    "Work: wr-2026-09-27-fresh", "Owner: leadslug", "Status: owned", "Artifact: none",
    `Log: ${hoursAgoIso(1.9)} owned leadslug note`, "",
  ]);
  commitAll(root, "fresh record");
  pushBranch(root, "build/fresh-owned");
  backToMain(root);

  newBranch(root, "build/stall-owned");
  writeRecord(root, "wr-2026-09-27-stall.record.md", [
    "Work: wr-2026-09-27-stall", "Owner: leadslug", "Status: owned", "Artifact: none",
    `Log: ${hoursAgoIso(2.1)} owned leadslug note`, "",
  ]);
  commitAll(root, "stall record");
  const stallTip = git(["rev-parse", "HEAD"], root).trim();
  pushBranch(root, "build/stall-owned");
  backToMain(root);

  const out = outTmp();
  const home = mkTmp("cstatus-home-");
  const spawn = fakeSpawnCounter();
  main(
    ["--repo", root, "--no-fetch", "--out", out, "--host", "testhost", "--stale-hours", "2"],
    { spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend, now: NOW, home },
  );

  assert.equal(spawn.calls.length, 1, `expected exactly one ASK, got: ${JSON.stringify(spawn.calls.map((c) => c.args))}`);
  const [{ args }] = spawn.calls;
  const get = (flag) => args[args.indexOf(flag) + 1];
  assert.equal(get("--kind"), "ASK");
  assert.equal(get("--from"), "collect-testhost");
  assert.equal(get("--to"), "leadslug");
  assert.ok(args.includes("--no-type"));
  assert.equal(get("--recipient-repo"), root);
  assert.equal(get("--topic"), `stall-build-stall-owned-${stallTip.slice(0, 7)}`);
  assert.equal(get("--needs"), "review");
  assert.equal(get("--by"), timeParts(new Date(NOW + 30 * 60_000)).time);
  assert.match(
    get("--text"),
    /^build\/stall-owned has had no Log line for 2\.1 h in state owned\. Reply with the lane state and a new ETA, or BLOCKED\. A Log line on the record resets this\.$/,
  );
});

test("stall-nudge: dedupe - a second run on the same tip sends nothing; a new tip idle past the threshold asks again", () => {
  const root = initRepoWithOrigin();
  const NOW = Date.parse("2026-09-27T12:00:00Z");
  const logAt = new Date(NOW - 2.1 * 3_600_000).toISOString();

  newBranch(root, "build/dedupe-owned");
  writeRecord(root, "wr-2026-09-27-dedupe.record.md", [
    "Work: wr-2026-09-27-dedupe", "Owner: leadslug", "Status: owned", "Artifact: none",
    `Log: ${logAt} owned leadslug note`, "",
  ]);
  commitAll(root, "dedupe record");
  const tip1 = git(["rev-parse", "HEAD"], root).trim();
  pushBranch(root, "build/dedupe-owned");
  backToMain(root);

  const out = outTmp();
  const home = mkTmp("cstatus-home-");
  const spawn = fakeSpawnCounter();
  const opts = { spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend, now: NOW, home };

  main(["--repo", root, "--no-fetch", "--out", out, "--stale-hours", "2"], opts);
  assert.equal(spawn.calls.length, 1, "first run: asks once");
  const firstArgs = spawn.calls[0].args;
  const from = firstArgs[firstArgs.indexOf("--from") + 1];
  const topic = firstArgs[firstArgs.indexOf("--topic") + 1];

  // fakeSpawnCounter never really runs note-send, so nothing writes the ledger line the real
  // tool would have; write the same id prefix a real send would have produced (S2 dedupe reads
  // docs/ledger/*.md, never re-derives an id from spawn.calls).
  const ledgerDir = path.join(root, "docs", "ledger");
  fs.mkdirSync(ledgerDir, { recursive: true });
  fs.writeFileSync(path.join(ledgerDir, "2026-09-27.md"), `sent already [${from}-${topic}-1] ASK: stalled.\n`);

  main(["--repo", root, "--no-fetch", "--out", out, "--stale-hours", "2"], opts);
  assert.equal(spawn.calls.length, 1, "second run, same tip: ledger hit, sends nothing more");

  // A new tip, still idle past the threshold: an unrelated follow-up commit changes tipSha
  // while the record (and its stale Log:) are untouched, so the topic's sha7 changes and the
  // dedupe check does not fire.
  checkoutExisting(root, "build/dedupe-owned");
  fs.writeFileSync(path.join(root, "unrelated-2.txt"), "x\n");
  commitAll(root, "unrelated follow-up commit");
  const tip2 = git(["rev-parse", "HEAD"], root).trim();
  assert.notEqual(tip2, tip1);
  pushBranch(root, "build/dedupe-owned");
  backToMain(root);

  main(["--repo", root, "--no-fetch", "--out", out, "--stale-hours", "2"], opts);
  assert.equal(spawn.calls.length, 2, "new tip, still idle: asks again");
});

test("stall-nudge: S4 - the kill-switch file suppresses the ASK; the attention row stays in status.md", () => {
  const root = initRepoWithOrigin();
  const NOW = Date.parse("2026-09-27T12:00:00Z");
  const logAt = new Date(NOW - 2.1 * 3_600_000).toISOString();
  newBranch(root, "build/killed-owned");
  writeRecord(root, "wr-2026-09-27-killed.record.md", [
    "Work: wr-2026-09-27-killed", "Owner: leadslug", "Status: owned", "Artifact: none",
    `Log: ${logAt} owned leadslug note`, "",
  ]);
  commitAll(root, "killed record");
  pushBranch(root, "build/killed-owned");
  backToMain(root);

  const out = outTmp();
  const home = mkTmp("cstatus-home-");
  fs.mkdirSync(path.join(home, ".agents", "collect", path.basename(root)), { recursive: true });
  fs.writeFileSync(path.join(home, ".agents", "collect", path.basename(root), "no-nudge"), "");

  const spawn = fakeSpawnCounter();
  main(["--repo", root, "--no-fetch", "--out", out, "--stale-hours", "2"], {
    spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend, now: NOW, home,
  });
  assert.equal(spawn.calls.length, 0, "kill switch: no ASK");

  const status = JSON.parse(fs.readFileSync(path.join(out, "status.json"), "utf8"));
  assert.deepEqual(status.summary.attention.map((a) => a.reason), ["silent-over-2-h"]);
  const md = fs.readFileSync(path.join(out, "status.md"), "utf8");
  assert.ok(md.includes("silent-over-2-h"), "attention row still in status.md despite the kill switch");
});

test("stall-nudge: S3 - no ASK when Owner is none, missing, or fails note-send's slug grammar", () => {
  const root = initRepoWithOrigin();
  const NOW = Date.parse("2026-09-27T12:00:00Z");
  const logAt = new Date(NOW - 2.1 * 3_600_000).toISOString();

  newBranch(root, "build/owner-none");
  writeRecord(root, "wr-2026-09-27-none.record.md", [
    "Work: wr-2026-09-27-none", "Owner: none", "Status: owned", "Artifact: none",
    `Log: ${logAt} owned t1 note`, "",
  ]);
  commitAll(root, "owner none record");
  pushBranch(root, "build/owner-none");
  backToMain(root);

  newBranch(root, "build/owner-missing");
  writeRecord(root, "wr-2026-09-27-missing.record.md", [
    "Work: wr-2026-09-27-missing", "Status: owned", "Artifact: none",
    `Log: ${logAt} owned t1 note`, "",
  ]);
  commitAll(root, "owner missing record");
  pushBranch(root, "build/owner-missing");
  backToMain(root);

  newBranch(root, "build/owner-bad-grammar");
  writeRecord(root, "wr-2026-09-27-bad.record.md", [
    "Work: wr-2026-09-27-bad", "Owner: Not A Slug", "Status: owned", "Artifact: none",
    `Log: ${logAt} owned t1 note`, "",
  ]);
  commitAll(root, "owner bad grammar record");
  pushBranch(root, "build/owner-bad-grammar");
  backToMain(root);

  const out = outTmp();
  const home = mkTmp("cstatus-home-");
  const spawn = fakeSpawnCounter();
  main(["--repo", root, "--no-fetch", "--out", out, "--stale-hours", "2"], {
    spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend, now: NOW, home,
  });
  assert.equal(spawn.calls.length, 0, "no usable Owner anywhere: no ASK");
});

test("stall-nudge: S2 - a ledger read error means no ASK this run (fail closed, not open)", () => {
  const root = initRepoWithOrigin();
  const NOW = Date.parse("2026-09-27T12:00:00Z");
  const logAt = new Date(NOW - 2.1 * 3_600_000).toISOString();
  newBranch(root, "build/ledger-err-owned");
  writeRecord(root, "wr-2026-09-27-ledgererr.record.md", [
    "Work: wr-2026-09-27-ledgererr", "Owner: leadslug", "Status: owned", "Artifact: none",
    `Log: ${logAt} owned leadslug note`, "",
  ]);
  commitAll(root, "ledger err record");
  pushBranch(root, "build/ledger-err-owned");
  backToMain(root);

  // Force a real (non-ENOENT) readdir failure: docs/ledger exists as a plain FILE, not a
  // directory, so readdirSync throws ENOTDIR regardless of the runner's own privileges (a
  // chmod-based test would pass as root and prove nothing).
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "ledger"), "not a directory\n");

  const out = outTmp();
  const home = mkTmp("cstatus-home-");
  const spawn = fakeSpawnCounter();
  main(["--repo", root, "--no-fetch", "--out", out, "--stale-hours", "2"], {
    spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend, now: NOW, home,
  });
  assert.equal(spawn.calls.length, 0, "ledger read error: fail closed, no ASK");
});

test("stall-nudge: a failed fetch never sends an ASK either, same promise as the RESULT", () => {
  const root = initRepoWithOrigin();
  const NOW = Date.parse("2026-09-27T12:00:00Z");
  const logAt = new Date(NOW - 2.1 * 3_600_000).toISOString();
  newBranch(root, "build/fetchfail-owned");
  writeRecord(root, "wr-2026-09-27-fetchfail.record.md", [
    "Work: wr-2026-09-27-fetchfail", "Owner: leadslug", "Status: owned", "Artifact: none",
    `Log: ${logAt} owned leadslug note`, "",
  ]);
  commitAll(root, "fetchfail record");
  pushBranch(root, "build/fetchfail-owned");
  backToMain(root);

  const out = outTmp();
  const home = mkTmp("cstatus-home-");
  const spawn = fakeSpawnCounter();
  const row = (b) => ({
    branch: b, tipSha: "a".repeat(40), tipDate: "2026-09-27T00:00:00Z", recordPath: `docs/work/${b}.record.md`,
    status: "owned", artifactSha: null, merged: null, hoursSinceLog: 2.1, state: "owned",
  });
  const collect = (argv, o) => {
    o.warn("collect-from-origin: git fetch failed, proceeding with local refs: x");
    o.write(JSON.stringify([row("fetchfail-owned")]));
    return 0;
  };
  main(["--repo", root, "--out", out, "--stale-hours", "2"], {
    spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend, now: NOW, home, collectMain: collect,
  });
  assert.equal(spawn.calls.length, 0, "a failed fetch never wakes anyone, ASK included");
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
