// Lane 73 (report-states-73, spec item 1): checks a PROGRESS report (runner, lead, or any
// long-running thing) carries the pinned first-line state and, for anything not DONE, the
// pinned second line.
//
// Usage: node scripts/report-check.mjs <report-path>
// Exit 0 when the report passes. Exit 1 naming what is missing or wrong (also for a
// usage/read error, since either way the check could not be completed as a pass). Same
// exit contract as scripts/bugfix-fields.mjs.
//
// Line 1 is exactly one of
//     DONE (<n> of <m> steps done)                      n must equal m
//     NEEDS BEN: <one line> (<n> of <m> steps done)
//     NEEDS <peer slug>: <one line> (<n> of <m> steps done)
//     FAILED: <why> (<n> of <m> steps done)
// The parentheses around "<n> of <m> steps done" are optional; the line must END with the
// phrase. PARTIAL is refused: a goal sits in that state for weeks and says nothing.
// Line 2, for anything not DONE:
//     Now: <one line> | To finish: <one line> | Est: <duration>
//
// Scope: reviewer, integrator and seam reports keep their `VERDICT: <word>` first line (the
// evidence check and accept depend on it, work-record.mjs); this check refuses such a line
// and says so, so it is never run on one by mistake.
//
// Line shapes use bounded `[ \t]` classes only, never `\s` or an unbounded quantifier before
// a capture (the same ReDoS-safe discipline as bugfix-fields.mjs).

import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const REPORT_STATES = ["DONE", "NEEDS BEN", "NEEDS <peer slug>", "FAILED"];

const STEPS_TAIL_RE = /[ \t]{0,20}[(]?[ \t]{0,5}(\d{1,6})[ \t]{1,5}of[ \t]{1,5}(\d{1,6})[ \t]{1,5}steps[ \t]{1,5}done[ \t]{0,5}[)]?[ \t]{0,20}$/;
const PEER_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

// "Now: <a> | To finish: <b> | Est: <c>" -> { now, toFinish, est } (each trimmed, non-empty),
// or null when the line does not have exactly that shape. Shared by the lane-record check in
// work-record.mjs, which stores the same line after a `Now:` header label.
export function parseProgressLine(line) {
  const m = /^[ \t]{0,20}Now:[ \t]{0,20}(.{1,400}?)[ \t]{1,20}\|[ \t]{1,20}To finish:[ \t]{0,20}(.{1,400}?)[ \t]{1,20}\|[ \t]{1,20}Est:[ \t]{0,20}(.{1,200}?)[ \t]{0,20}$/.exec(String(line ?? ""));
  if (!m) return null;
  const [now, toFinish, est] = [m[1].trim(), m[2].trim(), m[3].trim()];
  if (!now || !toFinish || !est || /\|/.test(est)) return null;
  return { now, toFinish, est };
}

// The same line without its leading "Now:" label (a lane record's `Now:` header value).
export function parseProgressValue(value) {
  return parseProgressLine(`Now: ${String(value ?? "")}`);
}

// -> { state, peer, n, m, errors: [string] } for report line 1.
export function parseFirstLine(line) {
  const errors = [];
  const raw = String(line ?? "").replace(/^﻿/, "").replace(/[\r \t]+$/, "");
  if (!raw.trim()) return { state: null, fatal: true, errors: ["first line is empty: expected DONE, NEEDS BEN: ..., NEEDS <peer slug>: ... or FAILED: ..."] };

  if (/^[ \t]*VERDICT:/i.test(raw)) {
    const partial = /PARTIAL/i.test(raw) ? " (PARTIAL is also refused)" : "";
    return { state: null, fatal: true, errors: [`first line is a VERDICT: line${partial}; VERDICT is for reviewer, integrator and seam reports, not progress reports. Use DONE, NEEDS BEN, NEEDS <peer slug> or FAILED`] };
  }
  if (/^[ \t]*PARTIAL\b/i.test(raw)) {
    return { state: null, fatal: true, errors: ["PARTIAL is refused: a long-running thing sits in it for weeks. Use NEEDS BEN, NEEDS <peer slug> or FAILED with a Now / To finish / Est line"] };
  }

  const tail = STEPS_TAIL_RE.exec(raw);
  if (!tail) errors.push("first line does not end with `<n> of <m> steps done`");
  const head = (tail ? raw.slice(0, tail.index) : raw).replace(/[ \t]+$/, "");
  const n = tail ? Number(tail[1]) : null;
  const m = tail ? Number(tail[2]) : null;
  if (tail && n > m) errors.push(`first line says ${n} of ${m} steps done: n cannot exceed m`);

  let state = null;
  let peer = null;
  if (/^DONE[ \t]{0,3}[,;|-]?$/.test(head)) {
    state = "DONE";
    if (tail && n !== m) errors.push(`DONE needs every step done, got ${n} of ${m}`);
  } else {
    const nm = /^NEEDS[ \t]{1,5}([^\s:]{1,64})[ \t]{0,5}:[ \t]{0,5}(.{0,400})$/.exec(head);
    const fm = /^FAILED[ \t]{0,5}:[ \t]{0,5}(.{0,400})$/.exec(head);
    if (nm) {
      const who = nm[1];
      const reason = nm[2].trim();
      if (who === "BEN") state = "NEEDS BEN";
      else if (who.toLowerCase() === "ben") errors.push(`write the owner as exactly "NEEDS BEN", got "NEEDS ${who}"`);
      else if (!PEER_SLUG_RE.test(who)) errors.push(`peer slug "${who}" is not lowercase letters, digits and dashes`);
      else { state = "NEEDS <peer slug>"; peer = who; }
      if (!reason) errors.push(`NEEDS ${who}: needs a one-line reason after the colon`);
    } else if (fm) {
      state = "FAILED";
      if (!fm[1].trim()) errors.push("FAILED: needs the reason after the colon");
    } else if (/^DONE\b/.test(head)) {
      errors.push("DONE takes no text before the step count: write `DONE (<n> of <m> steps done)`");
    } else {
      errors.push("first line is not one of DONE, NEEDS BEN: <one line>, NEEDS <peer slug>: <one line>, FAILED: <why>");
    }
  }
  return { state, peer, n, m, errors };
}

// -> { ok, state, errors: [string] }; errors name what is missing or wrong.
export function checkReport(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const first = parseFirstLine(lines[0]);
  const errors = [...first.errors];
  const second = lines[1] ?? "";
  if (first.state === "DONE") {
    // line 2 is optional on DONE, but a Now: line that is present must be well formed
    if (/^[ \t]{0,20}Now:/.test(second) && !parseProgressLine(second)) {
      errors.push("line 2 is a malformed progress line: expected `Now: <one line> | To finish: <one line> | Est: <duration>`");
    }
  } else if (!first.fatal) {
    if (!second.trim()) {
      errors.push("line 2 is missing: expected `Now: <one line> | To finish: <one line> | Est: <duration>`");
    } else if (!parseProgressLine(second)) {
      errors.push("line 2 must be exactly `Now: <one line> | To finish: <one line> | Est: <duration>` with all three non-empty");
    }
  }
  return { ok: errors.length === 0, state: first.state, errors };
}

export function main(argv) {
  const reportPath = argv[0];
  if (!reportPath) {
    console.error("usage: report-check.mjs <report>");
    return 1;
  }
  let text;
  try {
    text = fs.readFileSync(reportPath, "utf8");
  } catch (e) {
    console.error(`report-check: cannot read ${reportPath}: ${e.message}`);
    return 1;
  }
  const result = checkReport(text);
  if (result.ok) {
    console.log(`report-check: ${result.state} first line${result.state === "DONE" ? "" : " and progress line"} present`);
    return 0;
  }
  console.log(`report-check: ${reportPath}: ${result.errors.join("; ")}`);
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = main(process.argv.slice(2));
}
