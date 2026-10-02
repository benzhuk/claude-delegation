// Lane 74 (janitor74): the multi-root sweep, owner-or-orphan, archive-then-remove, the deregistered
// listing, the untracked report and the report-mode default. Fixtures ONLY: every repo lives under a
// sealed fake home's fixture root (scripts/test-home.mjs), origin is a fixture bare repo, the roots,
// home, policy and clock are all injected. Nothing here reads the real home, ~/Code or a real origin.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";

import { makeTempHome } from "./test-home.mjs";
import { main, listWorktrees, idleHours, pathHasOpenProcess, fetchOrigin } from "./janitor.mjs";
import { listRecords } from "./work-record.mjs";
import { discoverRepos, isExcludedPath, normPath } from "./janitor-roots.mjs";
import { ownerOf, collectRecords } from "./janitor-owner.mjs";
import { archiveRefName } from "./janitor-archive.mjs";
import { runSweep, formatSweep, loadSweepPolicy, CLASS_IDS } from "./janitor-sweep.mjs";

const th = makeTempHome();
const HOME = th.fixtureRoot; // identity (includeIf) applies under here
const CODE = path.join(HOME, "Code");
const savedEnv = {};
let counter = 0;

before(() => {
  for (const k of ["GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM"]) savedEnv[k] = process.env[k];
  process.env.GIT_CONFIG_GLOBAL = th.env.GIT_CONFIG_GLOBAL;
  process.env.GIT_CONFIG_NOSYSTEM = "1";
});
after(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  th.cleanup();
});

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const uniq = (p) => `${p}-${process.pid}-${counter++}`;

/** A repo under Code/<group> with a fixture bare origin; returns { repo, bare }. */
function makeRepo(name, group = "", mainName = "main") {
  const repo = path.join(CODE, group, uniq(name));
  fs.mkdirSync(repo, { recursive: true });
  git(["init", "-q", "-b", mainName], repo);
  fs.writeFileSync(path.join(repo, "README.md"), "root\n");
  git(["add", "."], repo);
  git(["commit", "-q", "-m", "init"], repo);
  const bare = path.join(HOME, "origins", uniq(`${name}.git`));
  fs.mkdirSync(bare, { recursive: true });
  git(["init", "-q", "--bare", "-b", mainName], bare);
  git(["remote", "add", "origin", bare], repo);
  git(["push", "-q", "origin", mainName], repo);
  return { repo, bare };
}

/** A worktree under <repo>/.claude/worktrees/<name> on a new branch with one commit of its own. */
function addWt(repo, branch, name = branch.replace(/[^A-Za-z0-9-]/g, "-")) {
  const wt = path.join(repo, ".claude", "worktrees", name);
  git(["worktree", "add", "-q", "-b", branch, wt], repo);
  fs.writeFileSync(path.join(wt, "work.txt"), `${branch}\n`);
  git(["add", "."], wt);
  git(["commit", "-q", "-m", `work on ${branch}`], wt);
  return wt;
}

function writeRecord(dir, work, status, worktree) {
  const d = path.join(dir, "docs", "work");
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(
    path.join(d, `${work}.record.md`),
    [`Work: ${work}`, "Scope: fixture", "Owner: none", `Status: ${status}`, "Authority: x", "Artifact: none", "Evidence: none", "Next: x", "Opened: 2026-10-01T00:00:00Z", `Worktree: ${worktree}`, ""].join("\n"),
  );
}

const writePolicy = (act) => {
  fs.mkdirSync(path.join(HOME, ".agents"), { recursive: true });
  fs.writeFileSync(path.join(HOME, ".agents", "janitor-policy.json"), JSON.stringify({ act }));
};
const clearPolicy = () => fs.rmSync(path.join(HOME, ".agents", "janitor-policy.json"), { force: true });

const DAY = 86_400_000;
const roots = [{ kind: "code", path: CODE }];
const deps = { listWorktrees, listRecords, idleHours, pathHasOpenProcess, fetchOrigin };

// `group` sweeps only CODE/<group> (an isolated tree); `depsOver` replaces single deps; `policyOver` extends the policy.
function sweep({ apply = false, act = [], plusDays = 2, reclaim, group, depsOver = {}, policyOver = {} } = {}) {
  const base = act.length ? { present: true, act: new Set(act), exclude: [], excludeRemotes: [], roots: null, problem: null } : loadSweepPolicy(HOME);
  const policy = { ...base, ...policyOver };
  const useRoots = group ? [{ kind: "code", path: path.join(CODE, group) }] : roots;
  return runSweep({ home: HOME, roots: useRoots, apply, policy, nowMs: Date.now() + plusDays * DAY, deps: { ...deps, ...depsOver }, reclaim });
}
const rowsFor = (res, repo) => res.rows.filter((r) => r.repo === repo || (r.path && r.path.startsWith(repo)));
const originRefs = (bare) => git(["for-each-ref", "--format=%(refname)", "refs/heads/"], bare).trim().split("\n").filter(Boolean);
const fileOnRef = (bare, ref, file) => git(["show", `${ref}:${file}`], bare);

describe("roots (item 2): a list, not one pinned repo", () => {
  test("finds every repo under Code, a second repo included; never BTO, never dotfiles, honours an exclude list", () => {
    const a = makeRepo("alpha");
    const b = makeRepo("beta", "group");
    const bto = makeRepo("btorepo", "BTO");
    const dot = makeRepo("dotfiles-main");
    const skipped = makeRepo("skipme");
    const found = discoverRepos(CODE, { home: HOME, exclude: [skipped.repo] });
    assert.ok(found.includes(a.repo));
    assert.ok(found.includes(b.repo), "a repo one group deeper is found");
    assert.ok(!found.includes(bto.repo), "BTO is left to BTO");
    assert.ok(!found.includes(dot.repo), "the dotfiles repo is never touched");
    assert.ok(!found.includes(skipped.repo), "the configured exclude list is honoured");
    assert.equal(isExcludedPath(path.join(HOME, "Code", "BTO", "x"), { home: HOME }), true);
    assert.equal(isExcludedPath(path.join(HOME, "Code", "x"), { home: HOME }), false);
  });
});

describe("ownership (item 2): owned by an open record, or an orphan", () => {
  test("a Worktree: branch, path or territory branch is owned while the record is open; accepted or none is orphan", () => {
    const { repo } = makeRepo("own");
    const lane = addWt(repo, "build/lane-x", "lane-x");
    const terr = addWt(repo, "build/lane-x-builder", "wt-lane-x-builder");
    const other = addWt(repo, "build/other", "other");
    const closed = addWt(repo, "build/done", "done");
    writeRecord(repo, "wr-open", "open", "build/lane-x");
    writeRecord(repo, "wr-done", "accepted", "build/done");
    const list = listWorktrees(repo);
    const records = collectRecords([repo], listRecords);
    assert.deepEqual(ownerOf({ path: lane, branch: "build/lane-x" }, repo, list, records).owned, true);
    const t = ownerOf({ path: terr, branch: "build/lane-x-builder" }, repo, list, records);
    assert.equal(t.owned, true);
    assert.equal(t.via, "territory-branch");
    assert.equal(ownerOf({ path: other, branch: "build/other" }, repo, list, records).owned, false);
    assert.equal(ownerOf({ path: closed, branch: "build/done" }, repo, list, records).owned, false, "an accepted record does not own");
    writeRecord(repo, "wr-path", "open", other); // absolute path form
    const records2 = collectRecords([repo], listRecords);
    assert.equal(ownerOf({ path: other, branch: "build/other" }, repo, list, records2).owned, true);
  });
});

describe("dirty worktree: report mode by default, archive-then-remove when the policy says so", () => {
  test("report mode (no policy, even with apply): prints what it would do and changes nothing", () => {
    const { repo, bare } = makeRepo("rep");
    const wt = addWt(repo, "feature/dying", "dying");
    fs.writeFileSync(path.join(wt, "work.txt"), "uncommitted edit\n"); // dying builder: tracked edit
    fs.writeFileSync(path.join(wt, "new-untracked.txt"), "never committed\n");
    clearPolicy();
    const before = originRefs(bare);
    const res = sweep({ apply: true });
    const mine = rowsFor(res, repo).filter((r) => r.class === CLASS_IDS.dirtyWorktree);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].action, "would-archive-then-remove");
    assert.ok(fs.existsSync(wt), "worktree untouched");
    assert.deepEqual(originRefs(bare), before, "nothing pushed");
    const text = formatSweep(res, { apply: true, policy: loadSweepPolicy(HOME) });
    assert.match(text, /mode: report only/);
    console.log(`\n--- printed report-mode run against a fixture ---\n${text}\n--- end ---`);
  });

  test("a policy listing the class without --apply still only reports", () => {
    const { repo, bare } = makeRepo("noapply");
    const wt = addWt(repo, "feature/x", "x");
    fs.writeFileSync(path.join(wt, "u.txt"), "u\n");
    const res = sweep({ apply: false, act: [CLASS_IDS.dirtyWorktree] });
    assert.equal(rowsFor(res, repo)[0].action, "would-archive-then-remove");
    assert.ok(fs.existsSync(wt));
    assert.deepEqual(originRefs(bare), ["refs/heads/main"]);
  });

  test("act mode: tracked edit and untracked file land on origin as archive/..., then the worktree is gone", () => {
    const { repo, bare } = makeRepo("act");
    const wt = addWt(repo, "feature/dying2", "dying2");
    fs.writeFileSync(path.join(wt, "work.txt"), "uncommitted edit\n");
    fs.writeFileSync(path.join(wt, "new-untracked.txt"), "never committed\n");
    const res = sweep({ apply: true, act: [CLASS_IDS.dirtyWorktree] });
    const r = rowsFor(res, repo).find((x) => x.class === CLASS_IDS.dirtyWorktree);
    assert.equal(r.action, "archived-then-removed", r.detail);
    assert.ok(!fs.existsSync(wt), "worktree removed");
    const archives = originRefs(bare).filter((x) => x.startsWith("refs/heads/archive/"));
    assert.equal(archives.length, 1);
    assert.match(archives[0], /^refs\/heads\/archive\/dying2-[0-9a-f]{7}$/);
    assert.equal(fileOnRef(bare, archives[0], "new-untracked.txt"), "never committed\n");
    assert.equal(fileOnRef(bare, archives[0], "work.txt"), "uncommitted edit\n");
    for (const ref of originRefs(bare)) assert.ok(ref === "refs/heads/main" || ref.startsWith("refs/heads/archive/"), `only main and archive/ refs on origin, saw ${ref}`);
  });

  test("an owned worktree is never touched, even in act mode", () => {
    const { repo, bare } = makeRepo("owned");
    const wt = addWt(repo, "build/mine", "mine");
    fs.writeFileSync(path.join(wt, "u.txt"), "u\n");
    writeRecord(repo, "wr-mine", "open", "build/mine");
    const res = sweep({ apply: true, act: [CLASS_IDS.dirtyWorktree] });
    assert.equal(rowsFor(res, repo).filter((r) => r.class === CLASS_IDS.dirtyWorktree).length, 0);
    assert.equal(res.owned >= 1, true);
    assert.ok(fs.existsSync(wt));
    assert.deepEqual(originRefs(bare), ["refs/heads/main"]);
  });

  test("not idle 24 h: kept", () => {
    const { repo } = makeRepo("fresh");
    const wt = addWt(repo, "feature/fresh", "fresh");
    fs.writeFileSync(path.join(wt, "u.txt"), "u\n");
    const res = runSweep({ home: HOME, roots, apply: true, policy: { present: true, act: new Set([CLASS_IDS.dirtyWorktree]), exclude: [], roots: null }, nowMs: Date.now(), deps });
    const r = rowsFor(res, repo)[0];
    assert.equal(r.action, "keep");
    assert.match(r.detail, /idle/);
    assert.ok(fs.existsSync(wt));
  });

  test("ignored content would be lost: not removed, reported with the count", () => {
    const { repo, bare } = makeRepo("ign");
    const wt = addWt(repo, "feature/ign", "ign");
    fs.writeFileSync(path.join(repo, ".gitignore"), "secret.env\n");
    git(["add", ".gitignore"], repo);
    git(["commit", "-q", "-m", "ignore"], repo);
    git(["push", "-q", "origin", "main"], repo);
    git(["merge", "-q", "main"], wt);
    fs.writeFileSync(path.join(wt, "secret.env"), "k=v\n");
    fs.writeFileSync(path.join(wt, "u.txt"), "u\n");
    const res = sweep({ apply: true, act: [CLASS_IDS.dirtyWorktree] });
    const r = rowsFor(res, repo).find((x) => x.class === CLASS_IDS.dirtyWorktree);
    assert.equal(r.action, "keep");
    assert.match(r.detail, /ignored content \(1 path/);
    assert.ok(fs.existsSync(path.join(wt, "secret.env")));
    assert.deepEqual(originRefs(bare), ["refs/heads/main"]);
  });

  test("no resolvable git identity: skipped and reported, nothing removed, no identity set", () => {
    const { repo, bare } = makeRepo("noid");
    const wt = addWt(repo, "feature/noid", "noid");
    fs.writeFileSync(path.join(wt, "u.txt"), "u\n");
    const empty = path.join(HOME, "empty.gitconfig");
    fs.writeFileSync(empty, "");
    const prev = process.env.GIT_CONFIG_GLOBAL;
    process.env.GIT_CONFIG_GLOBAL = empty;
    try {
      const res = sweep({ apply: true, act: [CLASS_IDS.dirtyWorktree] });
      const r = rowsFor(res, repo).find((x) => x.class === CLASS_IDS.dirtyWorktree);
      assert.equal(r.action, "skipped");
      assert.match(r.detail, /no git identity/);
    } finally {
      process.env.GIT_CONFIG_GLOBAL = prev;
    }
    assert.ok(fs.existsSync(wt));
    assert.deepEqual(originRefs(bare), ["refs/heads/main"]);
  });
});

describe("unmerged local-only branch", () => {
  test("report mode, then act: pushed as archive/..., deleted locally; owned, remote-backed and merged ones stay", () => {
    const { repo, bare } = makeRepo("br");
    for (const b of ["stale/orphan", "build/keep", "pushed/one", "merged/one"]) {
      git(["checkout", "-q", "-b", b, "main"], repo);
      fs.writeFileSync(path.join(repo, `${b.replace("/", "-")}.txt`), `${b}\n`);
      git(["add", "."], repo);
      git(["commit", "-q", "-m", b], repo);
      git(["checkout", "-q", "main"], repo);
    }
    git(["push", "-q", "origin", "pushed/one"], repo);
    git(["merge", "-q", "--no-ff", "-m", "merge", "merged/one"], repo);
    git(["push", "-q", "origin", "main"], repo);
    writeRecord(repo, "wr-keep", "open", "build/keep");
    const report = sweep({ apply: true });
    const rows = report.rows.filter((r) => r.class === CLASS_IDS.unmergedBranch && r.repo === repo);
    assert.deepEqual(rows.map((r) => r.branch), ["stale/orphan"]);
    assert.equal(rows[0].action, "would-archive-then-delete");
    assert.equal(git(["branch", "--list", "stale/orphan"], repo).trim(), "stale/orphan");
    const act = sweep({ apply: true, act: [CLASS_IDS.unmergedBranch] });
    const r = act.rows.find((x) => x.class === CLASS_IDS.unmergedBranch && x.repo === repo);
    assert.equal(r.action, "archived-then-deleted", r.detail);
    assert.equal(git(["branch", "--list", "stale/orphan"], repo).trim(), "", "deleted locally");
    assert.ok(originRefs(bare).some((x) => /^refs\/heads\/archive\/stale-orphan-[0-9a-f]{7}$/.test(x)));
    for (const b of ["build/keep", "pushed/one"]) assert.equal(git(["branch", "--list", b], repo).trim(), b, `${b} kept`);
  });
});

describe("merged origin branches: report only", () => {
  test("lists a merged origin branch with no record and never deletes it", () => {
    const { repo, bare } = makeRepo("mo");
    git(["checkout", "-q", "-b", "done/one", "main"], repo);
    fs.writeFileSync(path.join(repo, "d.txt"), "d\n");
    git(["add", "."], repo);
    git(["commit", "-q", "-m", "d"], repo);
    git(["push", "-q", "origin", "done/one"], repo);
    git(["checkout", "-q", "main"], repo);
    git(["merge", "-q", "--no-ff", "-m", "m", "done/one"], repo);
    git(["push", "-q", "origin", "main"], repo);
    const res = sweep({ apply: true, act: [CLASS_IDS.mergedOrigin] });
    const r = res.rows.find((x) => x.class === CLASS_IDS.mergedOrigin && x.repo === repo);
    assert.equal(r.action, "report-only");
    assert.ok(originRefs(bare).includes("refs/heads/done/one"));
  });
});

describe("deregistered folders (item 2, item 3, autonomy 5)", () => {
  test("lists a folder with a broken .git link and a stray clone; archives the dirty clone; removal needs a hand when reclaim refuses", () => {
    const { repo } = makeRepo("dereg");
    const wtRoot = path.join(repo, ".claude", "worktrees");
    fs.mkdirSync(wtRoot, { recursive: true });
    const broken = path.join(wtRoot, "broken-leftover");
    fs.mkdirSync(broken);
    fs.writeFileSync(path.join(broken, ".git"), "gitdir: /nonexistent/gone/worktrees/x\n");
    const stray = path.join(wtRoot, "stray-clone");
    const bare = path.join(HOME, "origins", uniq("stray.git"));
    fs.mkdirSync(bare, { recursive: true });
    git(["init", "-q", "--bare", "-b", "main"], bare);
    git(["clone", "-q", bare, stray], HOME);
    fs.writeFileSync(path.join(stray, "a.txt"), "a\n");
    git(["add", "."], stray);
    git(["commit", "-q", "-m", "a"], stray);
    git(["push", "-q", "origin", "main"], stray);
    fs.writeFileSync(path.join(stray, "dirty.txt"), "uncommitted\n");

    const report = sweep({ apply: true });
    const d = report.rows.filter((r) => r.class === CLASS_IDS.deregistered);
    assert.equal(d.find((r) => r.path === broken).action, "report-only");
    assert.match(d.find((r) => r.path === broken).detail, /broken \.git link/);
    assert.equal(d.find((r) => r.path === stray).action, "would-archive");
    assert.ok(fs.existsSync(stray));

    const refusing = { dryRun: () => ({ ok: false, out: "refused: inside a git checkout" }), remove: () => assert.fail("must not remove") };
    const act = sweep({ apply: true, act: [CLASS_IDS.deregistered], reclaim: refusing });
    const r = act.rows.find((x) => x.path === stray);
    assert.equal(r.action, "archived");
    assert.match(r.detail, /removal needs a hand/);
    assert.ok(fs.existsSync(stray), "left in place");
    assert.ok(originRefs(bare).some((x) => /^refs\/heads\/archive\/stray-clone-[0-9a-f]{7}$/.test(x)));
    assert.equal(fileOnRef(bare, originRefs(bare).find((x) => x.includes("archive/")), "dirty.txt"), "uncommitted\n");
  });

  test("the real reclaim bridge refuses a folder inside a checkout (dry run only)", () => {
    const { repo } = makeRepo("dereg2");
    const wtRoot = path.join(repo, ".claude", "worktrees");
    fs.mkdirSync(wtRoot, { recursive: true });
    const stray = path.join(wtRoot, "stray2");
    const bare = path.join(HOME, "origins", uniq("stray2.git"));
    fs.mkdirSync(bare, { recursive: true });
    git(["init", "-q", "--bare", "-b", "main"], bare);
    git(["clone", "-q", bare, stray], HOME);
    fs.writeFileSync(path.join(stray, "a.txt"), "a\n");
    git(["add", "."], stray);
    git(["commit", "-q", "-m", "a"], stray);
    git(["push", "-q", "origin", "main"], stray);
    fs.writeFileSync(path.join(stray, "d.txt"), "d\n");
    const res = sweep({ apply: true, act: [CLASS_IDS.deregistered] });
    const r = res.rows.find((x) => x.path === stray);
    assert.equal(r.action, "archived", r.detail);
    assert.match(r.detail, /removal needs a hand/);
    assert.ok(fs.existsSync(stray));
  });
});

describe("untracked files in a durable checkout (item 5, report part)", () => {
  test("files older than 7 days are reported by path, younger ones are not, nothing is removed", () => {
    const { repo } = makeRepo("unt");
    const old = path.join(repo, "docs-notes-packet.md");
    const young = path.join(repo, "fresh.md");
    fs.writeFileSync(old, "o\n");
    fs.writeFileSync(young, "y\n");
    const past = new Date(Date.now() - 20 * DAY);
    fs.utimesSync(old, past, past);
    const res = runSweep({ home: HOME, roots, apply: true, policy: { present: true, act: new Set([CLASS_IDS.untracked]), exclude: [], roots: null }, nowMs: Date.now(), deps });
    const rows = res.rows.filter((r) => r.class === CLASS_IDS.untracked && r.repo === repo);
    assert.deepEqual(rows.map((r) => r.path), [old]);
    assert.equal(rows[0].action, "report-only");
    assert.ok(fs.existsSync(old) && fs.existsSync(young));
  });
});

describe("policy file (item 7)", () => {
  test("absent = report only; corrupt = acts on nothing; valid lists classes", () => {
    clearPolicy();
    assert.equal(loadSweepPolicy(HOME).present, false);
    assert.equal(loadSweepPolicy(HOME).act.size, 0);
    fs.mkdirSync(path.join(HOME, ".agents"), { recursive: true });
    fs.writeFileSync(path.join(HOME, ".agents", "janitor-policy.json"), "{nope");
    const bad = loadSweepPolicy(HOME);
    assert.equal(bad.act.size, 0);
    assert.match(bad.problem, /not valid JSON/);
    writePolicy([CLASS_IDS.dirtyWorktree]);
    assert.equal(loadSweepPolicy(HOME).act.has(CLASS_IDS.dirtyWorktree), true);
    clearPolicy();
  });

  test("archive ref names are archive/<slug>-<7 hex>", () => {
    assert.equal(archiveRefName("wt lane/74", "abcdef0123456"), "archive/wt-lane-74-abcdef0");
  });
});

// Review round 1 (janitor74): every case below is isolated in its own CODE/<group> tree.
const branchOff = (repo, branch, mainName = "main") => {
  git(["checkout", "-q", "-b", branch, mainName], repo);
  fs.writeFileSync(path.join(repo, `${branch.replace("/", "-")}.txt`), `${branch}\n`);
  git(["add", "."], repo);
  git(["commit", "-q", "-m", branch], repo);
  git(["checkout", "-q", mainName], repo);
};
const makeStray = (repo, name) => {
  const wtRoot = path.join(repo, ".claude", "worktrees");
  fs.mkdirSync(wtRoot, { recursive: true });
  const stray = path.join(wtRoot, name);
  const bare = path.join(HOME, "origins", uniq(`${name}.git`));
  fs.mkdirSync(bare, { recursive: true });
  git(["init", "-q", "--bare", "-b", "main"], bare);
  git(["clone", "-q", bare, stray], HOME);
  fs.writeFileSync(path.join(stray, "a.txt"), "a\n");
  git(["add", "."], stray);
  git(["commit", "-q", "-m", "a"], stray);
  git(["push", "-q", "origin", "main"], stray);
  fs.writeFileSync(path.join(stray, "dirty.txt"), "uncommitted\n");
  return { stray, bare };
};
const rejectPushes = (bare) => {
  fs.mkdirSync(path.join(bare, "hooks"), { recursive: true });
  const hook = path.join(bare, "hooks", "pre-receive");
  fs.writeFileSync(hook, "#!/bin/sh\nexit 1\n");
  fs.chmodSync(hook, 0o755);
};
const dirtyOrphan = (repo, branch, name) => {
  const wt = addWt(repo, branch, name);
  fs.writeFileSync(path.join(wt, "work.txt"), "uncommitted edit\n");
  fs.writeFileSync(path.join(wt, "u.txt"), "untracked\n");
  return wt;
};
const wtRows = (res, wt) => res.rows.filter((r) => r.class === CLASS_IDS.dirtyWorktree && r.path && normPath(r.path) === normPath(wt));

describe("review round 1 fixes", () => {
  test("MAJOR 1: a closed record on main releases a worktree whose own checkout still holds the stale open copy", () => {
    const { repo } = makeRepo("stale", "iso-stale");
    writeRecord(repo, "wr-stale", "open", "build/lane-s");
    git(["add", "."], repo);
    git(["commit", "-q", "-m", "record"], repo);
    const terr = addWt(repo, "build/lane-s-builder", "wt-lane-s-builder"); // cut with the open copy checked out
    fs.writeFileSync(path.join(terr, "u.txt"), "u\n");
    const open = sweep({ group: "iso-stale" });
    assert.equal(wtRows(open, terr).length, 0, "owned while the record is open");
    assert.ok(open.owned >= 1);
    writeRecord(repo, "wr-stale", "closed", "build/lane-s"); // main's copy closes; the worktree's copy stays open
    assert.match(fs.readFileSync(path.join(terr, "docs", "work", "wr-stale.record.md"), "utf8"), /Status: open/);
    const closed = sweep({ group: "iso-stale" });
    assert.equal(wtRows(closed, terr)[0]?.action, "would-archive-then-remove");
  });

  test("MAJOR 2: a probe that throws stops the sweep, keeps the rows already produced, and acts on nothing", () => {
    const a = makeRepo("stopa", "iso-stop");
    branchOff(a.repo, "stale/a");
    const b = makeRepo("stopb", "iso-stop");
    const wt = dirtyOrphan(b.repo, "feature/stopb", "stopb");
    const res = sweep({ apply: true, act: [CLASS_IDS.dirtyWorktree, CLASS_IDS.unmergedBranch], group: "iso-stop", depsOver: { pathHasOpenProcess: () => { throw new Error("stopped: in-use probe could not put it back"); } } });
    assert.ok(res.rows.some((r) => r.class === CLASS_IDS.unmergedBranch && r.repo === a.repo), "rows produced before the stop are kept");
    const last = res.rows[res.rows.length - 1];
    assert.equal(last.action, "stopped");
    assert.match(last.detail, /in-use probe/);
    assert.ok(fs.existsSync(wt));
    assert.deepEqual(originRefs(b.bare), ["refs/heads/main"]);
  });

  test("MAJOR 2: a process that holds the directory protects the dirty worktree", () => {
    const { repo, bare } = makeRepo("busy", "iso-busy");
    const wt = dirtyOrphan(repo, "feature/busy", "busy");
    const res = sweep({ apply: true, act: [CLASS_IDS.dirtyWorktree], group: "iso-busy", depsOver: { pathHasOpenProcess: () => true } });
    assert.equal(wtRows(res, wt)[0].action, "keep");
    assert.match(wtRows(res, wt)[0].detail, /a process holds/);
    assert.ok(fs.existsSync(wt));
    assert.deepEqual(originRefs(bare), ["refs/heads/main"]);
  });

  test("MAJOR 3: a deregistered dirty clone is held by the 24 h idle floor and by a live process", () => {
    const { repo } = makeRepo("dgate", "iso-dgate");
    const { stray, bare } = makeStray(repo, "stray-gate");
    const young = sweep({ apply: true, act: [CLASS_IDS.deregistered], group: "iso-dgate", plusDays: 0 });
    const r = young.rows.find((x) => x.path === stray);
    assert.equal(r.action, "keep");
    assert.match(r.detail, /idle -?\d+h < 24h/);
    assert.equal(git(["rev-parse", "--abbrev-ref", "HEAD"], stray).trim(), "main", "HEAD not detached");
    const busy = sweep({ apply: true, act: [CLASS_IDS.deregistered], group: "iso-dgate", plusDays: 2, depsOver: { pathHasOpenProcess: () => true } });
    assert.match(busy.rows.find((x) => x.path === stray).detail, /a process holds/);
    assert.equal(git(["rev-parse", "--abbrev-ref", "HEAD"], stray).trim(), "main");
    assert.deepEqual(originRefs(bare), ["refs/heads/main"], "nothing pushed");
  });

  test("MAJOR 4: a rejected archive push re-attaches HEAD, keeps the work, and the worktree keeps showing up", () => {
    const { repo, bare } = makeRepo("rej", "iso-rej");
    rejectPushes(bare);
    const wt = dirtyOrphan(repo, "feature/rej", "rej");
    const first = sweep({ apply: true, act: [CLASS_IDS.dirtyWorktree], group: "iso-rej" });
    assert.equal(wtRows(first, wt)[0].action, "failed");
    assert.match(wtRows(first, wt)[0].detail, /push failed/);
    assert.match(git(["status", "-sb"], wt).split("\n")[0], /^## feature\/rej/, "HEAD is back on the branch");
    assert.equal(fs.readFileSync(path.join(wt, "u.txt"), "utf8"), "untracked\n");
    assert.equal(fs.readFileSync(path.join(wt, "work.txt"), "utf8"), "uncommitted edit\n");
    const second = sweep({ apply: true, act: [CLASS_IDS.dirtyWorktree], group: "iso-rej" });
    assert.equal(wtRows(second, wt)[0]?.action, "failed", "the stalled worktree is reported again, not silently dropped");
    const unpushed = second.rows.filter((r) => r.status === "unpushed-archive" && r.repo === repo);
    assert.ok(unpushed.length >= 1, "the local archive branch is reported");
    assert.equal(unpushed[0].action, "report-only");
    assert.match(unpushed[0].detail, /narrow fetch refspec/, "the row names the narrow-refspec false positive");
    assert.equal(git(["show", `${unpushed[0].branch}:u.txt`], repo), "untracked\n", "the archived work is intact on that branch");
  });

  test("MAJOR 4: a successful archive leaves no unpushed-archive row behind", () => {
    const { repo } = makeRepo("okarch", "iso-okarch");
    dirtyOrphan(repo, "feature/okarch", "okarch");
    const act = sweep({ apply: true, act: [CLASS_IDS.dirtyWorktree], group: "iso-okarch" });
    assert.equal(act.rows.find((r) => r.class === CLASS_IDS.dirtyWorktree).action, "archived-then-removed");
    const again = sweep({ apply: true, act: [CLASS_IDS.dirtyWorktree], group: "iso-okarch" });
    assert.deepEqual(again.rows.filter((r) => r.status === "unpushed-archive"), []);
  });

  test("MAJOR 5: edits hidden by --skip-worktree are not archived-then-removed", () => {
    const { repo, bare } = makeRepo("skipw", "iso-skipw");
    const wt = addWt(repo, "feature/skipw", "skipw");
    git(["update-index", "--skip-worktree", "work.txt"], wt);
    fs.writeFileSync(path.join(wt, "work.txt"), "precious local edit\n");
    fs.writeFileSync(path.join(wt, "u.txt"), "u\n");
    const res = sweep({ apply: true, act: [CLASS_IDS.dirtyWorktree], group: "iso-skipw" });
    assert.equal(wtRows(res, wt)[0].action, "skipped");
    assert.match(wtRows(res, wt)[0].detail, /skip-worktree/);
    assert.equal(fs.readFileSync(path.join(wt, "work.txt"), "utf8"), "precious local edit\n");
    assert.deepEqual(originRefs(bare), ["refs/heads/main"]);
  });

  test("MINOR 1: a master-default repo gets its branch rows; a repo with no resolvable main says so", () => {
    const m = makeRepo("mast", "iso-master", "master");
    branchOff(m.repo, "stale/m", "master");
    const res = sweep({ group: "iso-master" });
    const r = res.rows.find((x) => x.class === CLASS_IDS.unmergedBranch && x.branch === "stale/m");
    assert.equal(r.action, "would-archive-then-delete");
    const t = makeRepo("trunkrepo", "iso-trunk", "trunk");
    branchOff(t.repo, "stale/t", "trunk");
    const none = sweep({ group: "iso-trunk" }).rows.find((x) => x.repo === t.repo);
    assert.equal(none.action, "keep");
    assert.match(none.detail, /no main branch resolved/);
  });

  test("MINOR 2: the policy exclude list applies to a registered worktree", () => {
    const { repo, bare } = makeRepo("excl", "iso-excl");
    const wt = dirtyOrphan(repo, "feature/excl", "excl");
    const res = sweep({ apply: true, act: [CLASS_IDS.dirtyWorktree], group: "iso-excl", policyOver: { exclude: [wt] } });
    assert.equal(wtRows(res, wt).length, 0);
    assert.ok(fs.existsSync(wt));
    assert.deepEqual(originRefs(bare), ["refs/heads/main"]);
  });

  test("MINOR 3: an origin that belongs to BTO (default pattern, or the policy's excludeRemotes) is never archived to", () => {
    const { repo } = makeRepo("btoorigin", "iso-bto");
    const wt = dirtyOrphan(repo, "feature/bto", "bto");
    branchOff(repo, "stale/bto");
    const real = git(["remote", "get-url", "origin"], repo).trim();
    git(["remote", "set-url", "origin", "https://github.com/nucleusfilms/bto-x.git"], repo);
    const res = sweep({ apply: true, act: [CLASS_IDS.dirtyWorktree, CLASS_IDS.unmergedBranch], group: "iso-bto" });
    assert.equal(wtRows(res, wt)[0].action, "keep");
    assert.match(wtRows(res, wt)[0].detail, /BTO remote/);
    assert.match(res.rows.find((r) => r.branch === "stale/bto").detail, /BTO remote/);
    assert.ok(fs.existsSync(wt));
    assert.equal(git(["branch", "--list", "stale/bto"], repo).trim(), "stale/bto");
    // a custom pattern from the policy file, against the fixture bare origin
    git(["remote", "set-url", "origin", real], repo);
    fs.mkdirSync(path.join(HOME, ".agents"), { recursive: true });
    fs.writeFileSync(path.join(HOME, ".agents", "janitor-policy.json"), JSON.stringify({ act: [CLASS_IDS.dirtyWorktree], excludeRemotes: ["/origins/"] }));
    try {
      const policy = loadSweepPolicy(HOME);
      assert.deepEqual(policy.excludeRemotes, ["/origins/"]);
      const custom = sweep({ apply: true, group: "iso-bto", policyOver: policy });
      assert.match(wtRows(custom, wt)[0].detail, /BTO remote/);
      assert.ok(fs.existsSync(wt));
    } finally {
      clearPolicy();
    }
  });
});

describe("main() wiring: existing runs unchanged, sweep is opt-in", () => {
  function runMain(args, { sweepOpts, now } = {}) {
    const { repo } = makeRepo("wire");
    fs.mkdirSync(path.join(repo, ".agents"), { recursive: true });
    fs.writeFileSync(path.join(repo, ".agents", "project.json"), JSON.stringify({ name: "wire", vcs: "git", main_branch: "main" }));
    const lines = [];
    const orig = console.log;
    console.log = (...a) => lines.push(a.join(" "));
    let code;
    try {
      code = main(args, { cwd: repo, home: HOME, sweepOpts, now });
    } finally {
      console.log = orig;
    }
    return { code, out: lines.join("\n") };
  }

  test("without --sweep and without a policy file the output has no SWEEP section and the exit code is the same", () => {
    clearPolicy();
    const plain = runMain(["--no-fetch"]);
    assert.doesNotMatch(plain.out, /SWEEP/);
    const withSweep = runMain(["--no-fetch", "--sweep"], { sweepOpts: { roots } });
    assert.match(withSweep.out, /SWEEP \(multi-root/);
    assert.equal(withSweep.code, plain.code, "the sweep never changes the exit code");
  });

  test("--json carries a sweep key only when the sweep ran", () => {
    clearPolicy();
    const off = runMain(["--no-fetch", "--json"]);
    assert.equal("sweep" in JSON.parse(off.out), false);
    const on = runMain(["--no-fetch", "--json", "--sweep"], { sweepOpts: { roots } });
    assert.ok(Array.isArray(JSON.parse(on.out).sweep.rows));
  });

  test("under node --test the default roots are never swept, even with --sweep and a policy file that names roots", () => {
    fs.mkdirSync(path.join(HOME, ".agents"), { recursive: true });
    fs.writeFileSync(path.join(HOME, ".agents", "janitor-policy.json"), JSON.stringify({ act: [CLASS_IDS.dirtyWorktree], roots: [{ kind: "code", path: CODE }] }));
    try {
      const r = runMain(["--no-fetch", "--sweep"]);
      assert.doesNotMatch(r.out, /SWEEP/);
    } finally {
      clearPolicy();
    }
  });

  test("a live process in a dirty worktree's directory keeps it, through main()'s own in-use check", async () => {
    const { repo, bare } = makeRepo("live", "iso-live");
    const wt = dirtyOrphan(repo, "feature/live", "live");
    writePolicy([CLASS_IDS.dirtyWorktree]);
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { cwd: wt, stdio: "ignore", env: th.env });
    try {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const r = runMain(["--apply"], { sweepOpts: { roots: [{ kind: "code", path: path.join(CODE, "iso-live") }] }, now: Date.now() + 2 * DAY });
      assert.match(r.out, /keep: .*live.* - a process holds this directory/);
      assert.ok(fs.existsSync(wt));
      assert.deepEqual(originRefs(bare), ["refs/heads/main"]);
    } finally {
      child.kill();
      clearPolicy();
    }
  });

  test("the record carries what the sweep did, and a failed sweep act makes an --apply run exit 1", () => {
    const rec = path.join(HOME, uniq("sweep-record"));
    const bad = makeRepo("recbad", "iso-rec");
    rejectPushes(bad.bare);
    dirtyOrphan(bad.repo, "feature/recbad", "recbad");
    writePolicy([CLASS_IDS.dirtyWorktree]);
    try {
      const r = runMain(["--apply", "--record", rec], { sweepOpts: { roots: [{ kind: "code", path: path.join(CODE, "iso-rec") }] }, now: Date.now() + 2 * DAY });
      assert.equal(r.code, 1);
      assert.match(r.out, /failed: .*recbad/);
      const files = fs.readdirSync(rec).filter((n) => n.endsWith(".json"));
      assert.equal(files.length, 1);
      const record = JSON.parse(fs.readFileSync(path.join(rec, files[0]), "utf8"));
      assert.equal(record.sweep.rows.length, 1);
      assert.equal(record.sweep.rows[0].action, "failed");
    } finally {
      clearPolicy();
    }
  });

  test("a policy file turns the sweep on without a flag", () => {
    writePolicy([]);
    try {
      const r = runMain(["--no-fetch"], { sweepOpts: { roots } });
      assert.match(r.out, /SWEEP \(multi-root/);
    } finally {
      clearPolicy();
    }
  });
});

describe("review round 2 fixes", () => {
  test("NEW MAJOR A: report mode and an empty act list never call the in-use probe", () => {
    const { repo } = makeRepo("noprobe", "iso-noprobe");
    const wt = dirtyOrphan(repo, "feature/noprobe", "noprobe");
    const { stray } = makeStray(repo, "stray-noprobe");
    let calls = 0;
    const depsOver = { pathHasOpenProcess: () => { calls += 1; return false; } };
    for (const opts of [{ apply: false }, { apply: true, act: [] }, { apply: true, act: [CLASS_IDS.untracked] }]) {
      const res = sweep({ ...opts, group: "iso-noprobe", depsOver });
      assert.equal(wtRows(res, wt)[0].action, "would-archive-then-remove");
      assert.equal(res.rows.find((r) => r.path === stray).action, "would-archive");
    }
    assert.equal(calls, 0, "the probe renames on win32; it runs only where a class acts");
    assert.ok(fs.existsSync(wt) && fs.existsSync(stray));
  });

  test("MINOR C: a worktree archived but not removed keeps showing as a report-only row", () => {
    const { repo } = makeRepo("stall", "iso-stall");
    const sha = git(["rev-parse", "HEAD"], repo).trim();
    git(["branch", `archive/stall-${sha.slice(0, 7)}`, sha], repo);
    const wt = path.join(repo, ".claude", "worktrees", "stall");
    git(["worktree", "add", "-q", "--detach", wt, sha], repo);
    const res = sweep({ apply: true, act: [CLASS_IDS.dirtyWorktree], group: "iso-stall" });
    const rows = wtRows(res, wt);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].action, "report-only");
    assert.match(rows[0].detail, /removal refused earlier, needs a hand/);
    assert.ok(fs.existsSync(wt), "nothing acts");
    git(["branch", "-D", `archive/stall-${sha.slice(0, 7)}`], repo);
    assert.equal(wtRows(sweep({ apply: true, act: [CLASS_IDS.dirtyWorktree], group: "iso-stall" }), wt).length, 0, "no archive branch, no row");
  });
});
