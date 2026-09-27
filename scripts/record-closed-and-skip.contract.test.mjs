import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { STATUSES, acceptanceMain, closeRecord, parseRecord, validateRecord, withdrawRecord } from "./work-record.mjs";
import { selectContinuationSnapshot } from "./continuation.mjs";
import { main as collectFromOrigin } from "./collect-from-origin.mjs";
import { buildStatusMd, computeChangeKey, main as collectStatus } from "./collect-status.mjs";
import { childEnv } from "../skills/multi/scripts/test-child-env.mjs";

function git(args, cwd, env) { return execFileSync("git", args, { cwd, env, encoding: "utf8" }).trim(); }
function fixtureEnv() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "record-closed-contract-home-"));
  fs.writeFileSync(path.join(home, ".gitconfig"), "[user]\n\tname = Contract\n\temail = contract@example.invalid\n");
  return childEnv(home);
}
function recordText({ status = "accepted", artifact, extra = [] } = {}) {
  return [
    "Work: wr-2026-09-27-contract", "Scope: scripts/work-record.mjs@deadbeef", "Owner: contract-lead",
    `Status: ${status}`, "Authority: contract fixture", `Artifact: ${artifact ?? "none"}`,
    "Evidence: docs/work/evidence/review.md", "Next: close the merged lane", "Opened: 2026-09-21T00:00:00Z",
    "Lead-session: contract-lead", "Spec-session: contract-spec", "Spec-from: 2026-09-21T00:00:00Z",
    ...extra, "", "Observed: independent contract fixture.", "",
  ].join("\n");
}
function closeFixture({ status = "accepted" } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "record-closed-contract-"));
  const env = fixtureEnv();
  git(["init", "-q"], root, env);
  fs.writeFileSync(path.join(root, "seed.txt"), "seed\n");
  git(["add", "seed.txt"], root, env); git(["commit", "-qm", "seed"], root, env);
  const artifact = git(["rev-parse", "HEAD"], root, env);
  fs.mkdirSync(path.join(root, "docs", "work", "evidence"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "work", "evidence", "review.md"), "VERDICT: APPROVE\ncontract proof\n");
  const record = "docs/work/contract.record.md";
  fs.writeFileSync(path.join(root, record), recordText({ status, artifact, extra: [`Log: 2026-09-21T01:00:00Z accepted contract-lead artifact ${artifact}`] }));
  git(["add", "docs"], root, env); git(["commit", "-qm", "accepted record"], root, env);
  const merge = git(["rev-parse", "HEAD"], root, env);
  git(["update-ref", "refs/remotes/origin/main", merge], root, env);
  return { root, env, record, merge, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
function runClose(f, args = []) {
  const out = []; const err = [];
  const code = acceptanceMain(["close", "--record", f.record, "--repo", f.root, "--merge", f.merge, "--at", new Date().toISOString(), ...args], {
    write: (s) => out.push(s), warn: (s) => err.push(s),
  });
  return { code, out, err };
}

test("close is exported and closes an accepted record through the CLI on a real git repository", (t) => {
  const f = closeFixture(); t.after(f.cleanup);
  assert.equal(typeof closeRecord, "function");
  assert.equal(runClose(f).code, 0);
  const text = fs.readFileSync(path.join(f.root, f.record), "utf8");
  assert.match(text, /^Status: closed$/m);
  assert.match(text, new RegExp(`^Log: .* closed contract-lead merge ${f.merge}$`, "m"));
  assert.deepEqual(validateRecord(parseRecord(text), { repoRoot: f.root }), []);
  const before = fs.readFileSync(path.join(f.root, f.record));
  assert.throws(() => withdrawRecord({ repoRoot: f.root, recordPath: f.record, reason: "no", by: "contract", at: new Date().toISOString() }));
  assert.deepEqual(fs.readFileSync(path.join(f.root, f.record)), before, "closed is terminal");
});

test("close refusals preserve record bytes: source status, ancestry, already closed, and clock", (t) => {
  const cases = [
    { status: "owned", args: [] },
    { status: "accepted", args: ["--merge", "0".repeat(40)] },
    { status: "closed", args: [] },
    { status: "accepted", args: ["--at", new Date(Date.now() - 3_600_000).toISOString()] },
  ];
  for (const c of cases) {
    const f = closeFixture({ status: c.status }); t.after(f.cleanup);
    const before = fs.readFileSync(path.join(f.root, f.record));
    const result = runClose(f, c.args);
    assert.notEqual(result.code, 0, `${c.status}/${c.args.join(" ")} must refuse`);
    assert.deepEqual(fs.readFileSync(path.join(f.root, f.record)), before);
  }
});

test("a hand-edited closed status is invalid without the accepted and closed receipts", (t) => {
  const f = closeFixture({ status: "closed" }); t.after(f.cleanup);
  const parsed = parseRecord(fs.readFileSync(path.join(f.root, f.record), "utf8"));
  const findings = validateRecord(parsed, { repoRoot: f.root });
  assert.ok(findings.some((fnd) => fnd.level === "finding"), "closed must inherit accepted checks and require its receipt");
});

test("continuation snapshots every declared status, including closed and withdrawn, without SELECTION_UNREADABLE", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "record-closed-continuation-")); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "docs", "work", "evidence"), { recursive: true });
  fs.writeFileSync(path.join(root, "authority.md"), "contract authority\n");
  fs.writeFileSync(path.join(root, "docs", "work", "evidence", "review.md"), "VERDICT: APPROVE\nproof\n");
  for (const [i, status] of STATUSES.entries()) {
    const extra = status === "closed" ? ["Log: 2026-09-21T02:00:00Z closed worker merge aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]
      : status === "accepted" ? ["Log: 2026-09-21T01:00:00Z accepted worker artifact aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]
        : [`Log: 2026-09-21T01:00:00Z ${status} worker`];
    fs.writeFileSync(path.join(root, "docs", "work", `s${i}.record.md`), recordText({ status, artifact: "docs/x@aaaaaaaa", extra }).replace("wr-2026-09-27-contract", `wr-2026-09-27-contract-${i}`));
  }
  const snapshot = selectContinuationSnapshot({ repo: root, roots: STATUSES.map((_, i) => `wr-2026-09-27-contract-${i}`), authorityRef: "authority.md" });
  assert.equal(snapshot.status, "OK", snapshot.problems?.join(", "));
  for (const status of STATUSES) assert.ok(Array.isArray(snapshot.buckets[status]), `bucket ${status}`);
});

function prefixFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "record-closed-prefix-")); const env = fixtureEnv();
  git(["init", "-q"], root, env); fs.writeFileSync(path.join(root, "base.txt"), "base\n");
  git(["add", "."], root, env); git(["commit", "-qm", "base"], root, env);
  const main = git(["rev-parse", "HEAD"], root, env); git(["branch", "-M", "main"], root, env); git(["update-ref", "refs/remotes/origin/main", main], root, env);
  for (const name of ["build/l23-1", "feat/noise"]) {
    git(["checkout", "-qb", name, "main"], root, env); fs.mkdirSync(path.join(root, "docs", "work"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", "work", `${name.replace(/\//g, "-")}.record.md`), `Work: wr-2026-09-27-${name.replace(/\//g, "-")}\nStatus: owned\nArtifact: none\n\n`);
    git(["add", "."], root, env); git(["commit", "-qm", name], root, env);
    git(["update-ref", `refs/remotes/origin/${name}`, "HEAD"], root, env);
  }
  git(["checkout", "-q", "main"], root, env);
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
function rowsFor(root, args) { const out = []; assert.equal(collectFromOrigin(["--repo", root, "--no-fetch", "--json", ...args], { write: (s) => out.push(s) }), 0); return JSON.parse(out[0]); }

test("prefixes filter collector rows; collect-status defaults to build/, counts skipped branches, and labels rendered state lane", (t) => {
  const f = prefixFixture(); t.after(f.cleanup);
  assert.deepEqual(rowsFor(f.root, ["--only-prefix", "build/"]).map((r) => r.branch), ["build/l23-1"]);
  assert.deepEqual(rowsFor(f.root, ["--only-prefix", ""]).map((r) => r.branch).sort(), ["build/l23-1", "feat/noise"]);
  assert.deepEqual(rowsFor(f.root, ["--only-prefix", "feat/"]).map((r) => r.branch), ["feat/noise"]);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "record-closed-status-")); t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  assert.equal(collectStatus(["--repo", f.root, "--no-fetch", "--out", out, "--quiet"], {}), 0);
  const md = fs.readFileSync(path.join(out, "status.md"), "utf8");
  assert.match(md, /^skipped: 1 \(outside build\/\)$/m);
  assert.match(md, /lane/, "rendered Markdown column is lane");
  assert.match(md, /non-terminal Status.*owned/i, "legend explains the derived label");
  assert.ok(!md.includes("feat/noise"));
  assert.equal(collectStatus(["--repo", f.root, "--no-fetch", "--out", out, "--quiet", "--only-prefix", ""], {}), 0);
  assert.match(fs.readFileSync(path.join(out, "status.md"), "utf8"), /feat\/noise/);
});

test("change keys use only listed row data and survive the status.md lane-label rename", () => {
  const rows = [{ branch: "build/l23-1", recordPath: "docs/work/x.record.md", state: "owned", tipSha: "a".repeat(40) }];
  assert.equal(computeChangeKey(rows), computeChangeKey(rows.map((r) => ({ ...r }))));
  const md = buildStatusMd({ status: { generatedAt: "2026-09-27T20:00:00.000Z", main: { sha: "a".repeat(40) }, rows, summary: { byState: { owned: 1 }, attention: [] } }, fetchStatus: "ok", sendOutcome: { reason: null } });
  assert.match(md, /lane/);
  assert.equal(computeChangeKey(rows), computeChangeKey(rows), "presentation does not enter the key");
});
