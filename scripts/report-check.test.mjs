// node --test scripts/report-check.test.mjs
// Lane 73 item 1: the progress-report first line and the Now / To finish / Est second line.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkReport, parseFirstLine, parseProgressLine, parseProgressValue } from "./report-check.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "report-check.mjs");
const FIX = path.join(HERE, "fixtures", "report-states-73");
const fixture = (name) => path.join(FIX, name);
const runCli = (p) => spawnSync(process.execPath, [SCRIPT, p], { encoding: "utf8" });

test("report-check: DONE with every step done passes with no line 2", () => {
  const r = runCli(fixture("report-done.md"));
  assert.equal(r.status, 0);
  assert.equal(checkReport(fs.readFileSync(fixture("report-done.md"), "utf8")).state, "DONE");
});

test("report-check: NEEDS BEN, NEEDS <peer slug> and FAILED each pass with the progress line", () => {
  for (const [name, state] of [["report-needs-ben.md", "NEEDS BEN"], ["report-needs-peer.md", "NEEDS <peer slug>"], ["report-failed.md", "FAILED"]]) {
    const r = runCli(fixture(name));
    assert.equal(r.status, 0, `${name}: ${r.stdout}`);
    assert.equal(checkReport(fs.readFileSync(fixture(name), "utf8")).state, state);
  }
});

test("report-check: PARTIAL is refused, exit 1, naming PARTIAL", () => {
  const r = runCli(fixture("report-partial.md"));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /PARTIAL is refused/);
});

test("report-check: a report missing line 2 is refused, naming the line", () => {
  const r = runCli(fixture("report-missing-line2.md"));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /line 2 is missing/);
  assert.match(r.stdout, /Now: <one line> \| To finish: <one line> \| Est: <duration>/);
});

test("report-check: line 2 with a field absent or empty is refused", () => {
  assert.equal(runCli(fixture("report-incomplete-line2.md")).status, 1);
  const base = "FAILED: x (1 of 2 steps done)\n";
  assert.equal(checkReport(`${base}Now: a | To finish: b | Est:`).ok, false);
  assert.equal(checkReport(`${base}Now: | To finish: b | Est: 1 day`).ok, false);
  assert.equal(checkReport(`${base}Now: a | To finish: b | Est: 1 day`).ok, true);
});

test("report-check: a first line without the steps phrase is refused", () => {
  const r = runCli(fixture("report-no-steps.md"));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /steps done/);
});

test("report-check: DONE with fewer steps done than total is refused", () => {
  const r = runCli(fixture("report-done-short.md"));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /DONE needs every step done, got 3 of 5/);
});

test("report-check: a VERDICT: line is refused here and the message names the reviewer scope", () => {
  const r = runCli(fixture("report-verdict.md"));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /VERDICT is for reviewer, integrator and seam reports/);
  assert.equal(checkReport("VERDICT: PARTIAL\nx").ok, false);
});

test("report-check: owner spelling and peer slug shape", () => {
  const tail = "\nNow: a | To finish: b | Est: 1 day";
  assert.equal(checkReport(`NEEDS ben: x (1 of 2 steps done)${tail}`).ok, false);
  assert.equal(checkReport(`NEEDS Skills_O: x (1 of 2 steps done)${tail}`).ok, false);
  assert.equal(checkReport(`NEEDS skills-o: (1 of 2 steps done)${tail}`).ok, false);
  assert.equal(checkReport(`NEEDS skills-o: x (1 of 2 steps done)${tail}`).ok, true);
  assert.equal(checkReport(`NEEDS skills-o: x, 1 of 2 steps done${tail}`).ok, true);
  assert.equal(checkReport(`FAILED: (1 of 2 steps done)${tail}`).ok, false);
  assert.equal(checkReport(`NEEDS BEN: x (3 of 2 steps done)${tail}`).ok, false);
});

test("report-check: empty file, missing path and no argument are exit 1", () => {
  assert.equal(checkReport("").ok, false);
  assert.equal(spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" }).status, 1);
  assert.equal(runCli(path.join(FIX, "does-not-exist.md")).status, 1);
});

test("parseProgressLine / parseProgressValue: the one line shape, shared with lane records", () => {
  assert.deepEqual(parseProgressLine("Now: a b | To finish: c d | Est: 2 hours"), { now: "a b", toFinish: "c d", est: "2 hours" });
  assert.deepEqual(parseProgressValue("a | To finish: c | Est: 1 day"), { now: "a", toFinish: "c", est: "1 day" });
  assert.equal(parseProgressLine("Now: a | Est: 1 day | To finish: c"), null);
  assert.equal(parseProgressLine("Now: a | To finish: c"), null);
  assert.equal(parseProgressLine("Now: a | To finish: c | Est: 1 day | extra"), null);
  assert.equal(parseFirstLine("DONE (2 of 2 steps done)").state, "DONE");
});

test("item 4: docs/components.md header names the hook card line format once, the same shape as report line 2", () => {
  const text = fs.readFileSync(path.join(HERE, "..", "docs", "components.md"), "utf8");
  const header = text.slice(0, text.indexOf("-->"));
  const shape = "<name>: Now: <one line> | To finish: <one line> | Est: <duration>";
  assert.equal(header.split(shape).length - 1, 1);
  assert.match(header, /report-check\.mjs\s+parseProgressLine/);
  // the example in the header is itself a valid progress line
  assert.ok(parseProgressLine("Now: done | To finish: nothing | Est: none"));
});

test("item 5: team-build and delegate briefs state the first-line rule exactly once each", () => {
  for (const rel of ["skills/team-build/SKILL.md", "skills/delegate/SKILL.md"]) {
    const text = fs.readFileSync(path.join(HERE, "..", rel), "utf8");
    assert.equal(text.split("First-line rule:").length - 1, 1, rel);
    assert.match(text, /First-line rule: a reviewer, integrator or seam report opens `VERDICT: <word>`;/, rel);
    assert.match(text, /`PARTIAL` is refused\./, rel);
  }
});

test("item 3 docs: the decision-item template shows the line under the title; the decisions skill states the rule", () => {
  const tpl = fs.readFileSync(path.join(HERE, "..", "skills", "decisions", "templates", "decision-item.md"), "utf8");
  assert.equal((tpl.match(/<\/summary>\n\tNow: /g) ?? []).length, 2);
  const skill = fs.readFileSync(path.join(HERE, "..", "skills", "decisions", "SKILL.md"), "utf8");
  assert.equal(skill.split("Every waiting item carries `Now: <one line> | To finish: <one line> | Est: <duration>`").length - 1, 1);
});

test("contract: docs/subagent-contract.md names both first-line kinds and the check script once", () => {
  const text = fs.readFileSync(path.join(HERE, "..", "docs", "subagent-contract.md"), "utf8");
  assert.match(text, /`PARTIAL` is refused/);
  assert.equal(text.split("node scripts/report-check.mjs <report>").length - 1, 1);
  assert.match(text, /reviewer, integrator or seam\*\* report keeps `VERDICT: <word>`/);
});
