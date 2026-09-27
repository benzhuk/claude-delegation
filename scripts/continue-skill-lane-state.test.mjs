// node scripts/continue-skill-lane-state.test.mjs
//
// C3 (collect-status-1): fixture test pinning skills/continue/SKILL.md's "read lane state from
// the collector, not peer notes" paragraph to the exact default status.md path the installer/
// collector actually write (contracts.md K1: `~/.agents/collect/<basename of --repo>/status.md`;
// for this repo that basename is `claude-delegation`). Modeled on the doc-content fixture pattern
// already used for skills/team-build/SKILL.md (scripts/work-record.test.mjs) and
// skills/janitor/SKILL.md (scripts/janitor.test.mjs): read the real shipped file, assert its text
// contains the exact literal path and rule, rather than gesturing at "the collector's status file".
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = path.join(HERE, "..", "skills", "continue", "SKILL.md");

// The exact default path the collector (C1) writes and the installer (C2) points at, pinned by
// contracts.md K1 for this repo (basename "claude-delegation").
const STATUS_MD_PATH = "~/.agents/collect/claude-delegation/status.md";

test("skills/continue/SKILL.md names the collector's exact default status.md path, not a paraphrase", () => {
  const text = fs.readFileSync(SKILL_PATH, "utf8");
  assert.ok(
    text.includes(STATUS_MD_PATH),
    `expected the exact literal path ${STATUS_MD_PATH} somewhere in skills/continue/SKILL.md`,
  );
});

test("skills/continue/SKILL.md: the lane-state paragraph says once per wave, never from peer notes, and gives the cross-host ssh cat form", () => {
  const text = fs.readFileSync(SKILL_PATH, "utf8");
  const headingIdx = text.indexOf("## Lane state comes from the collector");
  assert.ok(headingIdx !== -1, "expected a heading introducing the lane-state rule");
  const section = text.slice(headingIdx, headingIdx + 900);

  assert.match(section, /once per wave/, "the rule must be scoped to once per wave, not every turn");
  assert.match(section, /never lane-by-lane from peer notes/, "the rule must explicitly rule out peer notes as the source of lane state");
  assert.ok(section.includes(STATUS_MD_PATH), "the section itself (not just the file overall) must carry the exact path");
  assert.match(
    section,
    new RegExp(`ssh <collector host> cat ${STATUS_MD_PATH.replace(/[.*+?^${}()|[\]\\~]/g, "\\$&")}`),
    "must give the exact one-line ssh-cat form for a lead on another host",
  );
  assert.match(section, /collect-status-fresh/, "must point at the wiring check that makes an absent/stale status.md visible");
});
