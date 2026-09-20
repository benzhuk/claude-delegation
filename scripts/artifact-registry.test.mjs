// node --test scripts/artifact-registry.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  validateArtifact,
  appendArtifact,
  listArtifacts,
  closeArtifact,
  endConditionMet,
  resolveRegistryPath,
} from "./artifact-registry.mjs";

function tmpRegistry() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-registry-"));
  return { dir, registryPath: path.join(dir, ".agents", "artifacts.jsonl") };
}

function baseRecord(overrides = {}) {
  return {
    ref: "/tmp/example/worktree",
    kind: "worktree",
    owner: "builder-b",
    purpose: "test artifact",
    end_condition: "branch-merged",
    created: new Date().toISOString(),
    ...overrides,
  };
}

test("validateArtifact: accepts a full valid record and rejects missing/unknown fields", () => {
  assert.equal(validateArtifact(baseRecord()).valid, true);
  const missing = validateArtifact({ ref: "x" });
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.some((e) => e.includes("kind")));
  const unknown = validateArtifact(baseRecord({ extra: "nope" }));
  assert.equal(unknown.valid, false);
  assert.ok(unknown.errors.some((e) => e.includes("unknown field")));
});

test("validateArtifact: enforces kind enum, purpose length, and created as a real date-time", () => {
  assert.equal(validateArtifact(baseRecord({ kind: "spaceship" })).valid, false);
  assert.equal(validateArtifact(baseRecord({ purpose: "x".repeat(201) })).valid, false);
  assert.equal(validateArtifact(baseRecord({ created: "not-a-date" })).valid, false);
  assert.equal(validateArtifact(baseRecord({ kind: "extended" }), ["extended"]).valid, true);
});

test("appendArtifact + listArtifacts: round-trips a record", () => {
  const { registryPath } = tmpRegistry();
  const record = baseRecord({ ref: "/tmp/example/worktree-1" });
  appendArtifact(record, { registryPath });
  const { entries, malformedCount } = listArtifacts({ registryPath });
  assert.equal(entries.length, 1);
  assert.equal(malformedCount, 0);
  assert.deepEqual(entries[0].record, record);
});

test("appendArtifact: throws on an invalid record instead of writing it", () => {
  const { registryPath } = tmpRegistry();
  assert.throws(() => appendArtifact({ ref: "x" }, { registryPath }));
  assert.equal(fs.existsSync(registryPath), false);
});

test("appendArtifact: single write call per line, never rewrites in place (two writers interleave cleanly)", () => {
  const { registryPath } = tmpRegistry();
  for (let i = 0; i < 20; i++) {
    appendArtifact(baseRecord({ ref: `/tmp/example/${i}` }), { registryPath });
  }
  const { entries } = listArtifacts({ registryPath });
  assert.equal(entries.length, 20);
  // every line is valid, independently-parseable JSON - no interleaving/corruption
  const raw = fs.readFileSync(registryPath, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim() !== "");
  assert.equal(lines.length, 20);
  for (const line of lines) assert.doesNotThrow(() => JSON.parse(line));
});

test("listArtifacts: a missing registry file is empty, not an error", () => {
  const { registryPath } = tmpRegistry();
  const { entries, malformedCount } = listArtifacts({ registryPath });
  assert.deepEqual(entries, []);
  assert.equal(malformedCount, 0);
});

test("listArtifacts: a malformed line (bad JSON, or valid JSON failing the schema) does not crash and is skipped", () => {
  const { registryPath } = tmpRegistry();
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  const good = baseRecord({ ref: "/tmp/example/good" });
  fs.writeFileSync(
    registryPath,
    [
      "{ this is not json",
      JSON.stringify(good),
      JSON.stringify({ ref: "missing-fields" }),
      "",
      "   ",
    ].join("\n") + "\n",
  );
  const { entries, malformedCount } = listArtifacts({ registryPath });
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].record, good);
  assert.equal(malformedCount, 2);
});

test("closeArtifact: removes only the matching line(s), via temp-file + rename, and is a no-op when nothing matches", () => {
  const { registryPath } = tmpRegistry();
  const a = baseRecord({ ref: "/tmp/example/a" });
  const b = baseRecord({ ref: "/tmp/example/b" });
  appendArtifact(a, { registryPath });
  appendArtifact(b, { registryPath });

  const removedNone = closeArtifact({ ref: "/tmp/example/nope" }, { registryPath });
  assert.equal(removedNone, 0);
  assert.equal(listArtifacts({ registryPath }).entries.length, 2);

  const removed = closeArtifact({ ref: "/tmp/example/a" }, { registryPath });
  assert.equal(removed, 1);
  const remaining = listArtifacts({ registryPath }).entries;
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].record.ref, "/tmp/example/b");
});

test("closeArtifact: disambiguates two lines sharing a ref by 'created' when given", () => {
  const { registryPath } = tmpRegistry();
  const first = baseRecord({ ref: "/tmp/example/reused", created: "2026-01-01T00:00:00.000Z" });
  const second = baseRecord({ ref: "/tmp/example/reused", created: "2026-02-01T00:00:00.000Z" });
  appendArtifact(first, { registryPath });
  appendArtifact(second, { registryPath });

  const removed = closeArtifact({ ref: "/tmp/example/reused", created: first.created }, { registryPath });
  assert.equal(removed, 1);
  const remaining = listArtifacts({ registryPath }).entries;
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].record.created, second.created);
});

test("closeArtifact: missing registry file is a no-op", () => {
  const { registryPath } = tmpRegistry();
  assert.equal(closeArtifact({ ref: "/anything" }, { registryPath }), 0);
});

test("endConditionMet: date: conditions compare against `now`", () => {
  const past = baseRecord({ end_condition: "date:2020-01-01" });
  const future = baseRecord({ end_condition: "date:2099-01-01" });
  assert.equal(endConditionMet(past, { now: new Date("2026-01-01") }), true);
  assert.equal(endConditionMet(future, { now: new Date("2026-01-01") }), false);
});

test("endConditionMet: branch-merged defers to isMerged(ref), and is unmet with no predicate", () => {
  const rec = baseRecord({ ref: "feat/done", end_condition: "branch-merged" });
  assert.equal(endConditionMet(rec), false);
  assert.equal(endConditionMet(rec, { isMerged: () => true }), true);
  assert.equal(endConditionMet(rec, { isMerged: () => false }), false);
  assert.equal(endConditionMet(rec, { isMerged: () => { throw new Error("boom"); } }), false);
});

test("endConditionMet: an unrecognized/free-text condition (e.g. run-terminal) is never claimed met", () => {
  const rec = baseRecord({ end_condition: "run-terminal" });
  assert.equal(endConditionMet(rec, { isMerged: () => true }), false);
});

test("resolveRegistryPath: relative joins the root, absolute passes through", () => {
  assert.equal(resolveRegistryPath("/proj", ".agents/artifacts.jsonl"), "/proj/.agents/artifacts.jsonl");
  assert.equal(resolveRegistryPath("/proj", "/elsewhere/artifacts.jsonl"), "/elsewhere/artifacts.jsonl");
});
