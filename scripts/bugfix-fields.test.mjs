// node --test scripts/bugfix-fields.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findMissingFields } from "./bugfix-fields.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "bugfix-fields.mjs");

function writeReport(dir, name, text) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, text);
  return p;
}

function runCli(reportPath) {
  return spawnSync(process.execPath, [SCRIPT, reportPath], { encoding: "utf8" });
}

const ALL_FOUR = [
  "Cause: the parser trimmed the wrong whitespace class",
  "Discriminating check: a fixture with a tab-only trailer",
  "Fix location: scripts/work-record.mjs:61",
  "Simplification: none needed, single-line fix",
].join("\n");

test("findMissingFields: all four present and non-empty returns []", () => {
  assert.deepEqual(findMissingFields(ALL_FOUR), []);
});

test("findMissingFields: one label missing entirely is named", () => {
  const text = ALL_FOUR.split("\n").filter((l) => !l.startsWith("Fix location:")).join("\n");
  assert.deepEqual(findMissingFields(text), ["Fix location"]);
});

test("findMissingFields: a label present but empty is still missing", () => {
  const text = ALL_FOUR.replace("Simplification: none needed, single-line fix", "Simplification:");
  assert.deepEqual(findMissingFields(text), ["Simplification"]);
});

test("findMissingFields: a label present but only whitespace is still missing", () => {
  const text = ALL_FOUR.replace("Cause: the parser trimmed the wrong whitespace class", "Cause:   \t  ");
  assert.deepEqual(findMissingFields(text), ["Cause"]);
});

test("findMissingFields: accepts markdown bullet/bold decoration (dispatch-guard shape)", () => {
  const text = [
    "- **Cause:** root cause here",
    "* Discriminating check: distinguishes old from new behavior",
    "+ Fix location: file.mjs:1",
    "Simplification: dropped a redundant branch",
  ].join("\n");
  assert.deepEqual(findMissingFields(text), []);
});

test("findMissingFields: multiple labels missing are all named, in declared order", () => {
  const text = "Cause: only this one is here\n";
  assert.deepEqual(findMissingFields(text), ["Discriminating check", "Fix location", "Simplification"]);
});

test("CLI: exits 0 and prints a confirming line when all four fields are present", () => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "bugfix-fields-"));
  const p = writeReport(dir, "review.md", `VERDICT: APPROVE\n\n${ALL_FOUR}\n`);
  const r = runCli(p);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /all four fields present/);
});

test("CLI: exits 1 and names the missing field", () => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "bugfix-fields-"));
  const text = ALL_FOUR.split("\n").filter((l) => !l.startsWith("Discriminating check:")).join("\n");
  const p = writeReport(dir, "review.md", `VERDICT: NEEDS_FIXES\n\n${text}\n`);
  const r = runCli(p);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /Discriminating check/);
});

test("CLI: exits 1 with three of four present names only the fourth", () => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "bugfix-fields-"));
  const text = ALL_FOUR.replace("Fix location: scripts/work-record.mjs:61", "Fix location:");
  const p = writeReport(dir, "review.md", text);
  const r = runCli(p);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /missing Fix location/);
  assert.doesNotMatch(r.stdout, /Cause/);
  assert.doesNotMatch(r.stdout, /Simplification/);
});

test("CLI: a missing report file exits 1, not a crash", () => {
  const r = runCli(path.join(os.tmpdir(), "does-not-exist-" + Date.now() + ".md"));
  assert.equal(r.status, 1, r.stdout + r.stderr);
});

test("CLI: no argument exits 1 with a usage message", () => {
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage/);
});
