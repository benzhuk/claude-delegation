// C4 (spec.md): checks a bug-fix review report carries its four required, non-empty
// fields: Cause:, Discriminating check:, Fix location:, Simplification:.
//
// Usage: node scripts/bugfix-fields.mjs <review-report-path>
// Exit 0 when all four are present and non-empty. Exit 1 naming the missing labels
// (also used for a usage/read error, since either way the check could not be completed
// as a pass).
//
// Label regex shape copied verbatim from hooks/agent-dispatch-guard.mjs:89-135 (the
// dispatch guard's ReDoS-safe field shape, restated in next-build/spec.md's C1): a
// `[ \t]`-only class with an explicit `{0,20}` bound, never `\s`, never an unbounded
// quantifier before the capture.

import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const REQUIRED_LABELS = ["Cause", "Discriminating check", "Fix location", "Simplification"];

function labelRegex(label) {
  return new RegExp(`^[ \\t*+-]{0,20}${label}:\\**[ \\t]{0,20}(.+)$`, "mi");
}

function rtrim(s) {
  return s.replace(/[\r \t]+$/, "");
}

// Round-2 review MINOR 6: a fenced ```-block quoting an example (e.g. a template excerpt
// pasted for illustration) must not itself satisfy the field check. Strips every fenced
// block before matching; an unterminated fence (no closing ```) is left alone rather than
// swallowing the rest of the report.
function stripFencedBlocks(text) {
  return text.replace(/```[\s\S]*?```/g, "");
}

// -> [<missing label>, ...] (empty when all four are present and non-empty)
export function findMissingFields(text) {
  const searchable = stripFencedBlocks(text);
  const missing = [];
  for (const label of REQUIRED_LABELS) {
    const m = labelRegex(label).exec(searchable);
    const value = m ? rtrim(m[1]).trim() : "";
    if (!value) missing.push(label);
  }
  return missing;
}

export function main(argv) {
  const reportPath = argv[0];
  if (!reportPath) {
    console.error("usage: bugfix-fields.mjs <review-report>");
    return 1;
  }
  let text;
  try {
    text = fs.readFileSync(reportPath, "utf8");
  } catch (e) {
    console.error(`bugfix-fields: cannot read ${reportPath}: ${e.message}`);
    return 1;
  }
  const missing = findMissingFields(text);
  if (missing.length === 0) {
    console.log("bugfix-fields: all four fields present");
    return 0;
  }
  console.log(`bugfix-fields: missing ${missing.join(", ")}`);
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = main(process.argv.slice(2));
}
