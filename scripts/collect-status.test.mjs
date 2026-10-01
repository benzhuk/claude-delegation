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
import { timeParts, buildEnvelope } from "../skills/multi/scripts/envelope.mjs";
import { mainCheckout, gitRunner } from "../skills/multi/scripts/transport.mjs";

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
  assert.equal(d.staleHoursError, undefined, "no --stale-hours given: no error");
});

test("parseArgs: --stale-hours range 0.1-48 — in range carries no error, 0 and 99 set staleHoursError (lane 33 F1)", () => {
  for (const good of ["0.1", "48", "2", "6"]) {
    const a = parseArgs(["--stale-hours", good]);
    assert.equal(a.staleHours, Number(good));
    assert.equal(a.staleHoursError, undefined, `--stale-hours ${good} should carry no error`);
  }
  for (const bad of ["0", "99", "nope"]) {
    const a = parseArgs(["--stale-hours", bad]);
    assert.ok(a.staleHoursError && a.staleHoursError.includes("--stale-hours must be a number from 0.1 to 48"), `--stale-hours ${bad} should carry an error, got ${JSON.stringify(a.staleHoursError)}`);
  }
});

test("main: --stale-hours 0 or 99 is refused, exit 2, before computeAttention ever runs (lane 33 F1)", () => {
  for (const bad of ["0", "99"]) {
    const root = initRepoWithOrigin();
    const out = outTmp();
    const warnings = [];
    const code = main(["--repo", root, "--no-fetch", "--out", out, "--stale-hours", bad], {
      warn: (s) => warnings.push(s), home: mkTmp("cstatus-home-"),
    });
    assert.equal(code, 2, `--stale-hours ${bad} must exit 2`);
    assert.ok(warnings.some((w) => w.includes("--stale-hours must be a number from 0.1 to 48")), JSON.stringify(warnings));
    assert.ok(!fs.existsSync(path.join(out, "status.json")), `--stale-hours ${bad} must write nothing`);
  }
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

test("computeByState: closed is counted under its own key, never folded into owned (lane 33 F2)", () => {
  const rows = [{ state: "owned" }, { state: "closed" }, { state: "closed" }];
  assert.deepEqual(computeByState(rows), { owned: 1, closed: 2 });
});

test("computeAttention: a closed row is never flagged, even with an enormous hoursSinceLog (lane 33 F2 - closed is terminal, computeAttention only ever flags state owned)", () => {
  const rows = [{ branch: "b1", recordPath: "p1", state: "closed", tipDate: null, hoursSinceLog: 10_000 }];
  assert.deepEqual(computeAttention(rows, 4, 6, Date.now()), []);
});

test("grep: 'closed' appears in collect-status.mjs only in NOTE_STATE_TOKENS and the legend line (lane 33 F2 acceptance)", () => {
  const src = fs.readFileSync(new URL("./collect-status.mjs", import.meta.url), "utf8");
  const codeLines = src.split("\n").filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"));
  const hits = codeLines.filter((line) => line.includes("closed"));
  assert.equal(hits.length, 2, `expected exactly the NOTE_STATE_TOKENS and legend lines, got:\n${hits.join("\n")}`);
  assert.ok(hits.some((line) => /^const NOTE_STATE_TOKENS = new Set\(\[.*"closed".*\]\);$/.test(line)), "NOTE_STATE_TOKENS carries \"closed\"");
  assert.ok(hits.some((line) => line.includes("closed is its own terminal lane")), "the legend names closed");
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
  assert.equal(lines[4], "lane: every non-terminal Status shows as owned; closed is its own terminal lane");

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

test("stall-nudge: one ASK per stale owned/blocked row; none for accepted-merged/accepted-unmerged/rejected/withdrawn/no-record/closed or a 1.9h row; argv is exact", () => {
  const root = initRepoWithOrigin();
  // F4 (review r1): the old fixed `NOW` (2026-09-27T12:00:00Z) sat BEFORE the fixture commits' real
  // committer dates (the actual machine clock, whatever "today" really is when the test runs), so
  // `accepted-unmerged`'s own tipDate never read as "over merge-hours" and the acceptance claim that
  // it produces NO ask was never really exercised - the filter was never what excluded it. Anchoring
  // NOW five hours past the real clock keeps every commit `git commit` makes here safely "over
  // 4h old" by the time computeAttention runs, while every `hoursAgoIso(h)` below stays
  // self-consistently relative to this same NOW (the Log: field is a string, never a real commit
  // date, so its absolute value never has to match the machine clock).
  const NOW = Date.now() + 5 * 3_600_000;
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

  // F2, updated by lane 33 F2: `closed` is a terminal Status (work-record.mjs STATUSES) - computeState
  // (collect-from-origin.mjs) now returns its own "closed" state for it, never folding it into
  // "owned", so a stale closed record must never be flagged silent or asked, even though it would
  // pass every other test above's checks unchanged.
  newBranch(root, "build/closed-lane");
  writeRecord(root, "wr-2026-09-27-closed.record.md", [
    "Work: wr-2026-09-27-closed", "Owner: leadslug", "Status: closed", "Artifact: none",
    `Log: ${hoursAgoIso(2.5)} closed leadslug note`, "",
  ]);
  commitAll(root, "closed record");
  pushBranch(root, "build/closed-lane");
  backToMain(root);

  // F7: a stale row whose OWN Status: is a known-but-non-owned-bucket word ("blocked") must name
  // that word in the ASK text, not the row's bucket ("owned", which `computeState` gives every
  // non-terminal status alike) - the bucket says nothing a lead doesn't already know from being
  // asked at all.
  newBranch(root, "build/blocked-stalled");
  writeRecord(root, "wr-2026-09-27-blocked.record.md", [
    "Work: wr-2026-09-27-blocked", "Owner: leadslug", "Status: blocked", "Artifact: none",
    `Log: ${hoursAgoIso(2.3)} blocked leadslug note`, "",
  ]);
  commitAll(root, "blocked record");
  const blockedTip = git(["rev-parse", "HEAD"], root).trim();
  pushBranch(root, "build/blocked-stalled");
  backToMain(root);

  const out = outTmp();
  const home = mkTmp("cstatus-home-");
  const spawn = fakeSpawnCounter();
  main(
    ["--repo", root, "--no-fetch", "--out", out, "--host", "testhost", "--stale-hours", "2"],
    { spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend, now: NOW, home },
  );

  // F4: assert the underlying attention list BEFORE the call count, so a filter regression (mutant
  // M1: `stallRows = attention`, no filter at all) cannot hide behind a call count that happens to
  // still look right - it also proves accepted-unmerged really did trip its own reason this time,
  // and that `closed` never enters the list at all (F2).
  const status = JSON.parse(fs.readFileSync(path.join(out, "status.json"), "utf8"));
  assert.deepEqual(
    status.summary.attention.map((a) => a.reason).sort(),
    ["accepted-unmerged-over-4-h", "no-record", "silent-over-2-h", "silent-over-2-h"].sort(),
  );

  assert.equal(spawn.calls.length, 2, `expected exactly two ASKs (stall-owned, blocked-stalled), got: ${JSON.stringify(spawn.calls.map((c) => c.args))}`);
  const get = (args, flag) => args[args.indexOf(flag) + 1];
  const byBranch = (branchSuffix) => spawn.calls.map((c) => c.args).find((args) => get(args, "--topic").includes(branchSuffix));

  const stallArgs = byBranch("stall-build-stall-owned-");
  assert.ok(stallArgs, "no ASK for build/stall-owned");
  assert.equal(get(stallArgs, "--kind"), "ASK");
  assert.equal(get(stallArgs, "--from"), "collect-testhost");
  assert.equal(get(stallArgs, "--to"), "leadslug");
  assert.ok(stallArgs.includes("--no-type"));
  assert.equal(get(stallArgs, "--recipient-repo"), root);
  assert.equal(get(stallArgs, "--topic"), `stall-build-stall-owned-${stallTip.slice(0, 7)}`);
  assert.equal(get(stallArgs, "--needs"), "review");
  assert.equal(get(stallArgs, "--by"), timeParts(new Date(NOW + 30 * 60_000)).time);
  assert.match(
    get(stallArgs, "--text"),
    /^build\/stall-owned has had no Log line for 2\.1 h in state owned\. Reply with the lane state and a new ETA, or BLOCKED\. A Log line on the record resets this\.$/,
  );

  const blockedArgs = byBranch("stall-build-blocked-stalled-");
  assert.ok(blockedArgs, "no ASK for build/blocked-stalled");
  assert.equal(get(blockedArgs, "--topic"), `stall-build-blocked-stalled-${blockedTip.slice(0, 7)}`);
  assert.match(
    get(blockedArgs, "--text"),
    /^build\/blocked-stalled has had no Log line for 2\.3 h in state blocked\. Reply with the lane state and a new ETA, or BLOCKED\. A Log line on the record resets this\.$/,
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

  // fakeSpawnCounter never really runs note-send, so nothing writes the ledger line the real tool
  // would have. F5 (review r1): build that line with note-send's OWN `buildEnvelope` (never a
  // hand-written string that only happens to match ENVELOPE_RE), with id counter "-2" (a real
  // ledger can carry any counter, not just "-1" - the dedupe reads the PREFIX, never the suffix
  // number), and file it under the PREVIOUS day (note-send appends by the day it ran on, and the
  // dedupe scan reads every docs/ledger/*.md file, never only today's).
  const ledgerDir = path.join(root, "docs", "ledger");
  fs.mkdirSync(ledgerDir, { recursive: true });
  const ledgerLine = buildEnvelope({
    from, to: "leadslug", date: "9.26.26", time: "23:05", tz: "NYC",
    id: `${from}-${topic}-2`, kind: "ASK", body: "stalled already, an earlier run asked this.",
    needs: "review", by: "23:35",
  });
  fs.writeFileSync(path.join(ledgerDir, "2026-09-26.md"), `${ledgerLine}\n`);

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

// A spawnNoteSend stand-in that behaves like the REAL note-send for the one thing F1 needs proven:
// where the ledger line actually lands. It resolves `--recipient-repo` through the exact same
// `mainCheckout` note-send itself calls, builds a real envelope line with `buildEnvelope`, and
// appends it there - so a dedupe bug that reads the wrong directory shows up as a second real ASK,
// never as a passing assertion that never looked at the disk.
function fakeSpawnWritingLedger(now) {
  const calls = [];
  const counters = {};
  const fn = (execPath, args) => {
    calls.push({ execPath, args });
    const get = (flag) => args[args.indexOf(flag) + 1];
    const from = get("--from");
    const to = get("--to");
    const kind = get("--kind");
    const recipientRepo = get("--recipient-repo");
    const topic = get("--topic");
    const text = get("--text");
    const needsIdx = args.indexOf("--needs");
    const needsRaw = needsIdx === -1 ? undefined : args[needsIdx + 1];
    const byIdx = args.indexOf("--by");
    const by = byIdx === -1 ? undefined : args[byIdx + 1];
    const prefix = `${from}-${topic}`;
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    const id = `${prefix}-${counters[prefix]}`;
    const { date, time } = timeParts(new Date(now));
    const line = buildEnvelope({
      from, to, date, time, tz: "NYC", id, kind, body: text,
      needs: needsRaw === "none" ? undefined : needsRaw, by,
    });
    const target = mainCheckout(recipientRepo, gitRunner) ?? recipientRepo;
    const dir = path.join(target, "docs", "ledger");
    fs.mkdirSync(dir, { recursive: true });
    const ymd = timeParts(new Date(now)).ymd;
    fs.appendFileSync(path.join(dir, `${ymd}.md`), `${line}\n`);
    return { status: 0, stdout: "ok\n", stderr: "" };
  };
  fn.calls = calls;
  return fn;
}

test("stall-nudge: F1 - dedupe holds across two runs when --repo is a linked worktree (note-send's ledger lives in the MAIN checkout, never a worktree)", () => {
  const root = initRepoWithOrigin();
  const NOW = Date.parse("2026-09-27T12:00:00Z");
  const logAt = new Date(NOW - 2.1 * 3_600_000).toISOString();

  newBranch(root, "build/wt-stall-owned");
  writeRecord(root, "wr-2026-09-27-wtstall.record.md", [
    "Work: wr-2026-09-27-wtstall", "Owner: leadslug", "Status: owned", "Artifact: none",
    `Log: ${logAt} owned leadslug note`, "",
  ]);
  commitAll(root, "wt stall record");
  pushBranch(root, "build/wt-stall-owned");
  backToMain(root);

  // A linked worktree of `root`, detached (the primary worktree already has `main` checked out,
  // so `git worktree add` refuses to check the same branch out twice) - `collect-from-origin`
  // reads refs, not the working tree, so a detached worktree sees the exact same branches `root`
  // does; only where note-send's ledger physically lands is different, which is the whole point.
  const wtParent = mkTmp("cstatus-wtparent-");
  const wt = path.join(wtParent, "wt");
  const mainSha = git(["rev-parse", "main"], root).trim();
  git(["worktree", "add", "-q", "--detach", wt, mainSha], root);

  const out = outTmp();
  const home = mkTmp("cstatus-home-");
  const spawn = fakeSpawnWritingLedger(NOW);
  const opts = { spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend, now: NOW, home };

  main(["--repo", wt, "--no-fetch", "--out", out, "--stale-hours", "2"], opts);
  assert.equal(spawn.calls.length, 1, "first run from the worktree: asks once");
  assert.ok(!fs.existsSync(path.join(wt, "docs", "ledger")), "the worktree itself never grows a ledger");
  assert.ok(fs.existsSync(path.join(root, "docs", "ledger")), "the real ledger lands in the main checkout");

  main(["--repo", wt, "--no-fetch", "--out", out, "--stale-hours", "2"], opts);
  assert.equal(spawn.calls.length, 1, "second run, same tip, same worktree --repo: dedupe holds, sends nothing more");
});

test("stall-nudge: F3 - --quiet sends no ASK, even for an otherwise-stale row (attention still shows it)", () => {
  const root = initRepoWithOrigin();
  const NOW = Date.parse("2026-09-27T12:00:00Z");
  const logAt = new Date(NOW - 2.1 * 3_600_000).toISOString();
  newBranch(root, "build/quiet-owned");
  writeRecord(root, "wr-2026-09-27-quiet.record.md", [
    "Work: wr-2026-09-27-quiet", "Owner: leadslug", "Status: owned", "Artifact: none",
    `Log: ${logAt} owned leadslug note`, "",
  ]);
  commitAll(root, "quiet record");
  pushBranch(root, "build/quiet-owned");
  backToMain(root);

  const out = outTmp();
  const home = mkTmp("cstatus-home-");
  const spawn = fakeSpawnCounter();
  main(["--repo", root, "--no-fetch", "--out", out, "--stale-hours", "2", "--quiet"], {
    spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend, now: NOW, home,
  });
  assert.equal(spawn.calls.length, 0, "--quiet: no ASK sent, even though the row is 2.1h stale");

  const status = JSON.parse(fs.readFileSync(path.join(out, "status.json"), "utf8"));
  assert.deepEqual(status.summary.attention.map((a) => a.reason), ["silent-over-2-h"], "the row still shows in status.json/status.md");
});

test("stall-nudge: F6 - two stale records sharing one branch tip get exactly one ASK per run (the topic is per-tip, not per-record)", () => {
  const root = initRepoWithOrigin();
  const NOW = Date.parse("2026-09-27T12:00:00Z");
  const logAt = new Date(NOW - 2.1 * 3_600_000).toISOString();

  newBranch(root, "build/two-records");
  writeRecord(root, "wr-2026-09-27-two-a.record.md", [
    "Work: wr-2026-09-27-two-a", "Owner: leadslug", "Status: owned", "Artifact: none",
    `Log: ${logAt} owned leadslug note`, "",
  ]);
  writeRecord(root, "wr-2026-09-27-two-b.record.md", [
    "Work: wr-2026-09-27-two-b", "Owner: leadslug", "Status: owned", "Artifact: none",
    `Log: ${logAt} owned leadslug note`, "",
  ]);
  commitAll(root, "two stale records, one branch tip");
  pushBranch(root, "build/two-records");
  backToMain(root);

  const out = outTmp();
  const home = mkTmp("cstatus-home-");
  const spawn = fakeSpawnCounter();
  main(["--repo", root, "--no-fetch", "--out", out, "--stale-hours", "2"], {
    spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend, now: NOW, home,
  });

  assert.equal(spawn.calls.length, 1, "one branch tip is one topic - the second row's send is covered by the first, same as a real second run would be");
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

// ---------------------------------------------------------------------------
// Lane 43 (cross-host nudge, docs/specs/cross-host-nudge-1): the ASK for an owner on another
// host must carry --sender-host <that host> (note-send.mjs's own existing flag, resolveSenderHost),
// so the existing ssh mirror (runMirror) writes the line into the OWNER's own ledger instead of
// only the sender's. The Owner-to-host lookup is `.agents/project.json`'s `owner_hosts` key, read
// through the shared project-config loader - never a map hardcoded in this collector.
// ---------------------------------------------------------------------------

test("stall-nudge: an owner mapped in .agents/project.json's owner_hosts gets --sender-host <that host>", () => {
  const root = initRepoWithOrigin();
  fs.mkdirSync(path.join(root, ".agents"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".agents", "project.json"),
    JSON.stringify({ owner_hosts: { "skills-h": "zhuk-vps32" } }),
  );
  commitAll(root, "add owner_hosts table");
  git(["push", "-q", "origin", "main"], root);

  const NOW = Date.now() + 5 * 3_600_000;
  const hoursAgoIso = (h) => new Date(NOW - h * 3_600_000).toISOString();

  newBranch(root, "build/cross-host-stall");
  writeRecord(root, "wr-2026-09-27-crosshost.record.md", [
    "Work: wr-2026-09-27-crosshost", "Owner: skills-h", "Status: owned", "Artifact: none",
    `Log: ${hoursAgoIso(2.1)} owned skills-h note`, "",
  ]);
  commitAll(root, "cross-host stall record");
  pushBranch(root, "build/cross-host-stall");
  backToMain(root);

  const out = outTmp();
  const home = mkTmp("cstatus-home-");
  const spawn = fakeSpawnCounter();
  main(
    ["--repo", root, "--no-fetch", "--out", out, "--host", "testhost", "--stale-hours", "2"],
    { spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend, now: NOW, home },
  );

  assert.equal(spawn.calls.length, 1, `expected exactly one ASK, got: ${JSON.stringify(spawn.calls.map((c) => c.args))}`);
  const args = spawn.calls[0].args;
  const get = (flag) => args[args.indexOf(flag) + 1];
  assert.equal(get("--to"), "skills-h");
  assert.equal(get("--sender-host"), "zhuk-vps32");
});

test("stall-nudge: an owner absent from owner_hosts (table present, no entry for this owner) gets no --sender-host flag", () => {
  const root = initRepoWithOrigin();
  fs.mkdirSync(path.join(root, ".agents"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".agents", "project.json"),
    JSON.stringify({ owner_hosts: { "skills-h": "zhuk-vps32" } }),
  );
  commitAll(root, "add owner_hosts table");
  git(["push", "-q", "origin", "main"], root);

  const NOW = Date.now() + 5 * 3_600_000;
  const hoursAgoIso = (h) => new Date(NOW - h * 3_600_000).toISOString();

  newBranch(root, "build/unmapped-owner-stall");
  writeRecord(root, "wr-2026-09-27-unmapped.record.md", [
    "Work: wr-2026-09-27-unmapped", "Owner: leadslug", "Status: owned", "Artifact: none",
    `Log: ${hoursAgoIso(2.1)} owned leadslug note`, "",
  ]);
  commitAll(root, "unmapped owner stall record");
  pushBranch(root, "build/unmapped-owner-stall");
  backToMain(root);

  const out = outTmp();
  const home = mkTmp("cstatus-home-");
  const spawn = fakeSpawnCounter();
  main(
    ["--repo", root, "--no-fetch", "--out", out, "--host", "testhost", "--stale-hours", "2"],
    { spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend, now: NOW, home },
  );

  assert.equal(spawn.calls.length, 1, `expected exactly one ASK, got: ${JSON.stringify(spawn.calls.map((c) => c.args))}`);
  const args = spawn.calls[0].args;
  assert.equal(args.includes("--sender-host"), false, "no owner_hosts entry: no --sender-host flag, today's behaviour");
});

test("stall-nudge: with no .agents/project.json at all, no --sender-host flag is ever added (today's behaviour, unmodified)", () => {
  const root = initRepoWithOrigin();

  const NOW = Date.now() + 5 * 3_600_000;
  const hoursAgoIso = (h) => new Date(NOW - h * 3_600_000).toISOString();

  newBranch(root, "build/no-config-stall");
  writeRecord(root, "wr-2026-09-27-noconfig.record.md", [
    "Work: wr-2026-09-27-noconfig", "Owner: leadslug", "Status: owned", "Artifact: none",
    `Log: ${hoursAgoIso(2.1)} owned leadslug note`, "",
  ]);
  commitAll(root, "no-config stall record");
  pushBranch(root, "build/no-config-stall");
  backToMain(root);

  const out = outTmp();
  const home = mkTmp("cstatus-home-");
  const spawn = fakeSpawnCounter();
  main(
    ["--repo", root, "--no-fetch", "--out", out, "--host", "testhost", "--stale-hours", "2"],
    { spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend, now: NOW, home },
  );

  assert.equal(spawn.calls.length, 1, `expected exactly one ASK, got: ${JSON.stringify(spawn.calls.map((c) => c.args))}`);
  const args = spawn.calls[0].args;
  assert.equal(args.includes("--sender-host"), false, "no .agents/project.json: no --sender-host flag");
});

// ---------------------------------------------------------------------------
// Review r1 F2: an owner_hosts value that is not one of note-send's own MIRROR_HOSTS names (a
// typo, a renamed/dropped host) must fall back to the no-flag path, with one warn(), rather than
// reaching note-send and losing the ASK entirely (note-send refuses an unknown --sender-host with
// exit 1 before any write).
// ---------------------------------------------------------------------------

test("stall-nudge: an owner_hosts value that is not a MIRROR_HOSTS name falls back to no --sender-host, with one warning", () => {
  const root = initRepoWithOrigin();
  fs.mkdirSync(path.join(root, ".agents"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".agents", "project.json"),
    JSON.stringify({ owner_hosts: { "skills-h": "zhuk-vps-32" } }), // typo: a hyphen note-send does not know
  );
  commitAll(root, "add owner_hosts table with a typo'd host");
  git(["push", "-q", "origin", "main"], root);

  const NOW = Date.now() + 5 * 3_600_000;
  const hoursAgoIso = (h) => new Date(NOW - h * 3_600_000).toISOString();

  newBranch(root, "build/typo-host-stall");
  writeRecord(root, "wr-2026-09-27-typohost.record.md", [
    "Work: wr-2026-09-27-typohost", "Owner: skills-h", "Status: owned", "Artifact: none",
    `Log: ${hoursAgoIso(2.1)} owned skills-h note`, "",
  ]);
  commitAll(root, "typo host stall record");
  pushBranch(root, "build/typo-host-stall");
  backToMain(root);

  const out = outTmp();
  const home = mkTmp("cstatus-home-");
  const spawn = fakeSpawnCounter();
  const warnings = [];
  main(
    ["--repo", root, "--no-fetch", "--out", out, "--host", "testhost", "--stale-hours", "2"],
    { spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend, now: NOW, home, warn: (s) => warnings.push(s) },
  );

  assert.equal(spawn.calls.length, 1, `expected exactly one ASK, got: ${JSON.stringify(spawn.calls.map((c) => c.args))}`);
  const args = spawn.calls[0].args;
  assert.equal(args.includes("--sender-host"), false, "unknown host name: no --sender-host flag");
  assert.ok(
    warnings.some((w) => /owner_hosts maps skills-h to a host note-send does not know/.test(w)),
    `expected a warning naming the unknown host, got: ${JSON.stringify(warnings)}`,
  );
});

// Guard: every value in the repo's OWN .agents/project.json owner_hosts is a MIRROR_HOSTS name -
// catches a future rename/drop of a host in note-send.mjs's table before it silently strands a
// nudge (F2's class of bug), without needing a live send to notice.
test("guard: every value in this repo's own .agents/project.json owner_hosts is a MIRROR_HOSTS name", async () => {
  const { loadProjectConfig: loadRoot } = await import("./project-config.mjs");
  const { MIRROR_HOSTS: liveHosts } = await import("../skills/multi/scripts/note-send.mjs");
  const names = new Set(liveHosts.map((h) => h.name));
  const { config } = loadRoot(path.resolve(new URL(".", import.meta.url).pathname, ".."));
  for (const [owner, host] of Object.entries(config.owner_hosts)) {
    assert.ok(names.has(host), `owner_hosts["${owner}"] = "${host}" is not a MIRROR_HOSTS name (${[...names].join(", ")})`);
  }
});

// ---------------------------------------------------------------------------
// Review r1 F3: a failed mirror (note-send's own `mirrorLedger.ok === false` inside its stdout
// JSON) must produce exactly one warn() naming the owner's sender host, without changing the
// local send's own outcome or retrying.
// ---------------------------------------------------------------------------

test("stall-nudge: a failed mirror (mirrorLedger.ok === false in note-send's stdout JSON) produces one warning naming the sender host", () => {
  const root = initRepoWithOrigin();
  fs.mkdirSync(path.join(root, ".agents"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".agents", "project.json"),
    JSON.stringify({ owner_hosts: { "skills-h": "zhuk-vps32" } }),
  );
  commitAll(root, "add owner_hosts table");
  git(["push", "-q", "origin", "main"], root);

  const NOW = Date.now() + 5 * 3_600_000;
  const hoursAgoIso = (h) => new Date(NOW - h * 3_600_000).toISOString();

  newBranch(root, "build/mirror-fail-stall");
  writeRecord(root, "wr-2026-09-27-mirrorfail.record.md", [
    "Work: wr-2026-09-27-mirrorfail", "Owner: skills-h", "Status: owned", "Artifact: none",
    `Log: ${hoursAgoIso(2.1)} owned skills-h note`, "",
  ]);
  commitAll(root, "mirror-fail stall record");
  pushBranch(root, "build/mirror-fail-stall");
  backToMain(root);

  const out = outTmp();
  const home = mkTmp("cstatus-home-");
  const spawn = (execPath, args) => {
    spawn.calls.push({ execPath, args });
    return {
      status: 3,
      stdout: JSON.stringify({ mirrorLedger: { host: "zhuk-vps32", ok: false, error: "timeout" } }),
      stderr: "",
    };
  };
  spawn.calls = [];
  const warnings = [];
  main(
    ["--repo", root, "--no-fetch", "--out", out, "--host", "testhost", "--stale-hours", "2"],
    { spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend, now: NOW, home, warn: (s) => warnings.push(s) },
  );

  assert.equal(spawn.calls.length, 1);
  const mirrorWarnings = warnings.filter((w) => /mirror to zhuk-vps32 failed/.test(w));
  assert.equal(mirrorWarnings.length, 1, `expected exactly one mirror-failure warning, got: ${JSON.stringify(warnings)}`);
  assert.ok(/timeout/.test(mirrorWarnings[0]));
});

// ---------------------------------------------------------------------------
// Review r1 F6: owner_hosts is read from origin/main:.agents/project.json through the same git
// runner the ledger path already uses, with the working tree as fallback when that ref or file is
// missing or unparseable. Both paths use a FAKE git runner (never the real one for the seam under
// test), so neither depends on this fixture's real git push having updated origin/main already.
// ---------------------------------------------------------------------------

function fakeGitRunnerWith(showResponse) {
  return (args, cwd) => {
    if (args[0] === "show" && args[1] === "origin/main:.agents/project.json") {
      if (showResponse instanceof Error) throw showResponse;
      return showResponse;
    }
    return gitRunner(args, cwd); // anything else (mainCheckout's rev-parse) goes to the real git
  };
}

test("stall-nudge (F6): owner_hosts prefers origin/main's copy over the working tree, via a fake git runner", () => {
  const root = initRepoWithOrigin();
  // Working tree has NO .agents/project.json at all - only the fake git runner's origin/main
  // blob supplies the mapping, so a passing test proves origin/main was actually consulted.
  const NOW = Date.now() + 5 * 3_600_000;
  const hoursAgoIso = (h) => new Date(NOW - h * 3_600_000).toISOString();

  newBranch(root, "build/origin-main-hosts-stall");
  writeRecord(root, "wr-2026-09-27-originmain.record.md", [
    "Work: wr-2026-09-27-originmain", "Owner: skills-h", "Status: owned", "Artifact: none",
    `Log: ${hoursAgoIso(2.1)} owned skills-h note`, "",
  ]);
  commitAll(root, "origin-main-hosts stall record");
  pushBranch(root, "build/origin-main-hosts-stall");
  backToMain(root);

  const out = outTmp();
  const home = mkTmp("cstatus-home-");
  const spawn = fakeSpawnCounter();
  const fakeGit = fakeGitRunnerWith(JSON.stringify({ owner_hosts: { "skills-h": "zhuk-vps32" } }));
  main(
    ["--repo", root, "--no-fetch", "--out", out, "--host", "testhost", "--stale-hours", "2"],
    { spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend, now: NOW, home, gitRunner: fakeGit },
  );

  assert.equal(spawn.calls.length, 1);
  const args = spawn.calls[0].args;
  const get = (flag) => args[args.indexOf(flag) + 1];
  assert.equal(get("--sender-host"), "zhuk-vps32", "origin/main's owner_hosts should have been used");
});

test("stall-nudge (F6): falls back to the working-tree config when the fake git runner throws (missing ref/blob)", () => {
  const root = initRepoWithOrigin();
  fs.mkdirSync(path.join(root, ".agents"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".agents", "project.json"),
    JSON.stringify({ owner_hosts: { "skills-h": "zhuk-vps32" } }),
  );
  commitAll(root, "add working-tree owner_hosts table");
  // Deliberately NOT pushed to origin, so the real ref would not have this file either - but the
  // seam under test is the fake git runner throwing, standing in for "no origin/main ref yet".

  const NOW = Date.now() + 5 * 3_600_000;
  const hoursAgoIso = (h) => new Date(NOW - h * 3_600_000).toISOString();

  newBranch(root, "build/fallback-hosts-stall");
  writeRecord(root, "wr-2026-09-27-fallbackhosts.record.md", [
    "Work: wr-2026-09-27-fallbackhosts", "Owner: skills-h", "Status: owned", "Artifact: none",
    `Log: ${hoursAgoIso(2.1)} owned skills-h note`, "",
  ]);
  commitAll(root, "fallback-hosts stall record");
  pushBranch(root, "build/fallback-hosts-stall");
  backToMain(root);

  const out = outTmp();
  const home = mkTmp("cstatus-home-");
  const spawn = fakeSpawnCounter();
  const fakeGit = fakeGitRunnerWith(new Error("fatal: invalid object name 'origin/main:.agents/project.json'"));
  main(
    ["--repo", root, "--no-fetch", "--out", out, "--host", "testhost", "--stale-hours", "2"],
    { spawnNoteSend: spawn, resolveNoteSend: alwaysNoteSend, now: NOW, home, gitRunner: fakeGit },
  );

  assert.equal(spawn.calls.length, 1);
  const args = spawn.calls[0].args;
  const get = (flag) => args[args.indexOf(flag) + 1];
  assert.equal(get("--sender-host"), "zhuk-vps32", "a throwing git runner should fall back to the working-tree table");
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
