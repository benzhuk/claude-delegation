/**
 * decisions-render-sections: the three agent-owned toggles at the top of the decisions page
 * (Goal card, Bearings, Components), the tab-indent helper the page shape needs, and the
 * components path guard. Pure composition from `--repo`'s source files; the only side effect is
 * the optional injected read-only `execGit` (`ls-tree`, `log`), the same one the core uses.
 *
 * Shape (spec scope items 1, 2, 6): each toggle is `# Name {toggle="true"}`, tab-indented
 * children, and a trailing tab-indented `<empty-block/>` (the toggle-tail lint rule). Nothing is
 * invented: a field that cannot be found refuses (RefusedError, exit 2), never a default.
 *
 * The core imports this file and this file imports the core's error classes and prose checks;
 * every use of a core binding below is inside a function, never at module load, so the import
 * cycle is safe in either load order.
 */
import path from 'node:path';
import {
  RefusedError, BlindError, REPO_BLOB_BASE, checkProseLines, checkAutolinkLines,
} from './decisions-render-core.mjs';
import { computeSha } from './goals-mirror.mjs';

export const GOALS_PAGE_ID = '3e3da11277a1813cb326c42ed97a1d5d';
export const GOALS_PAGE_URL = `https://www.notion.so/${GOALS_PAGE_ID}`;
export const COMPONENT_STATES = ['fed', 'measured', 'unfed', 'partial', 'missing'];
const BEARINGS_VERDICTS = ['CONTINUE', 'RE-PLAN', 'CUT'];
const EVIDENCE_REL = ['docs', 'work', 'evidence'];

/** Every non-blank line of `text` gets one leading tab; a blank line stays blank. */
export function indentLines(text) {
  return String(text).split('\n').map((l) => (l === '' ? '' : `\t${l}`)).join('\n');
}

/** A toggle: heading, tab-indented children, trailing tab-indented empty block. */
export function toggleBlock(name, childLines) {
  return [`# ${name} {toggle="true"}`, ...childLines.map((l) => (l === '' ? '' : `\t${l}`)), '\t<empty-block/>'].join('\n');
}

function readRequired(readFile, full, label) {
  try {
    return readFile(full);
  } catch (e) {
    throw new BlindError(`cannot read ${label} (${full}): ${e instanceof Error ? e.message : e}`);
  }
}

/** Notion autolinks a bare `docs/GOALS.md`; wrap each bare file path in backticks first. */
export function wrapBareFilenames(line) {
  const parts = String(line).split(/(`[^`]*`)/);
  return parts.map((part, i) => (i % 2 === 1
    ? part
    : part.replace(/(?<![A-Za-z0-9_`/.-])((?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:md|sh|io|ai|co|me|so|py))(?![A-Za-z0-9_-]|[./][A-Za-z0-9_-])/gi, '`$1`'))).join('');
}

function checkLines(lines, label) {
  const text = lines.join('\n');
  checkProseLines(text, label);
  checkAutolinkLines(text, label);
}

// ─────────────────────────────────────────────────────────────────────────────
// Goal card
// ─────────────────────────────────────────────────────────────────────────────

/** The card sha: the last commit that changed the goals sources on origin/main, the same value
 * the Goals page mirror prints (`computeSha`). The hand-back compares it the same way. */
export function cardSha({ repo, execGit }) {
  try {
    return computeSha({ repo, git: (r, args) => execGit(args, r) });
  } catch (e) {
    throw new BlindError(`goal card: cannot determine the main sha (${e instanceof Error ? e.message : e})`);
  }
}

export function buildCardToggle({ repo, readFile, execGit }) {
  const full = path.join(repo, 'docs', 'goals', 'card.md');
  const text = readRequired(readFile, full, 'docs/goals/card.md');
  const cardLines = String(text).replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim() !== '');
  if (cardLines.length === 0) throw new RefusedError('docs/goals/card.md is empty; the Goal card toggle shows its full text and invents none');
  const sha = cardSha({ repo, execGit });
  const wrapped = cardLines.map((l) => wrapBareFilenames(l.trim()));
  // The "main at <sha>" line is exempt from the hex-token prose rule: it is the one place a sha
  // belongs on this page, and the hand-back reads it from there.
  checkLines(wrapped, 'goal-card');
  const children = [`main at ${sha}`, ...wrapped];
  return toggleBlock('Goal card', children);
}

// ─────────────────────────────────────────────────────────────────────────────
// Bearings
// ─────────────────────────────────────────────────────────────────────────────

function newestBearingsDate(readdirSync, dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch (e) {
    throw new BlindError(`cannot list ${dir}: ${e instanceof Error ? e.message : e}`);
  }
  const have = new Set(names);
  // The newest date that has BOTH files: the assessment lands before the lead writes the
  // response, and an unpaired newest assessment must not blind the page.
  const all = names
    .map((n) => /^(\d{4}-\d{2}-\d{2})-bearings-assessment\.md$/.exec(n))
    .filter(Boolean)
    .map((m) => m[1]);
  if (all.length === 0) throw new RefusedError('no docs/work/evidence/<date>-bearings-assessment.md found; the Bearings toggle invents nothing');
  const dates = all.filter((d) => have.has(`${d}-bearings-response.md`)).sort();
  if (dates.length === 0) throw new BlindError(`no bearings assessment has its -bearings-response.md yet (newest assessment: ${all.sort().pop()})`);
  return dates[dates.length - 1];
}

/** Strips list markers and bold off a captured field. */
function clean(s) {
  return s.replace(/\*\*/g, '').trim();
}

/** The verdict word: first word of a field, backticks and bold stripped, trailing punctuation dropped. */
function verdictWord(s) {
  const first = s.replace(/[`*]/g, '').trim().split(/\s+/)[0] ?? '';
  return first.replace(/[.,;:]+$/, '');
}

/** The decision: a bare verdict on line 1, or `DECISION:`/`VERDICT:` followed by one on line 1,
 * else the first `Decision:` line (list item, heading or bare) of the assessment. */
function bearingsDecision(aLines) {
  const first = (aLines.find((l) => l.trim() !== '') ?? '').trim();
  if (BEARINGS_VERDICTS.includes(first)) return first;
  const lead = /^(?:DECISION|VERDICT):\s*(.+)$/.exec(first);
  if (lead && BEARINGS_VERDICTS.includes(verdictWord(lead[1]))) return verdictWord(lead[1]);
  for (const l of aLines) {
    const m = /^\s*(?:[-*]\s+|#{1,3}\s+)?(?:\*\*)?Decision:(?:\*\*)?\s*(.+)$/.exec(l);
    if (m && !m[1].includes('|') && BEARINGS_VERDICTS.includes(verdictWord(m[1]))) return verdictWord(m[1]);
  }
  return null;
}

/** A prediction field that only points elsewhere carries no prediction. */
function isPointer(text) {
  return /^see\b.{0,60}$/i.test(text.trim()) || /^\[[^\]]*\]$/.test(text.trim());
}

export function parseBearings(assessmentText, responseText, date) {
  const aLines = String(assessmentText).replace(/\r\n/g, '\n').split('\n');
  const verdict = bearingsDecision(aLines);
  if (verdict === null) {
    const first = (aLines.find((l) => l.trim() !== '') ?? '').trim();
    throw new RefusedError(`bearings ${date}: no decision found: line 1 is "${first.slice(0, 40)}" and no "Decision:" line names one of ${BEARINGS_VERDICTS.join(', ')}`);
  }
  const field = (lines, re) => {
    for (const l of lines) {
      const m = re.exec(l);
      if (m && clean(m[1]) !== '') return clean(m[1]);
    }
    return null;
  };
  const condition = field(aLines, /^\s*(?:[-*]\s+)?(?:\*\*)?Condition:(?:\*\*)?\s*(.+)$/);
  const nextAction = field(aLines, /^\s*(?:[-*]\s+)?(?:\*\*)?Next action:(?:\*\*)?\s*(.+)$/);
  if (nextAction === null) throw new RefusedError(`bearings ${date}: no "Next action:" line in the assessment`);
  const rLines = String(responseText).replace(/\r\n/g, '\n').split('\n');
  let checkDate = null;
  let prediction = null;
  for (const l of rLines) {
    const m = /^\s*(?:\*\*)?Check on (\d{1,2}\/\d{1,2} \d{1,2}:\d{2} [AP]M)(?:\*\*)?:\s*(.+)$/.exec(l);
    if (m && clean(m[2]) !== '') {
      checkDate = m[1];
      prediction = clean(m[2]);
      break;
    }
  }
  if (prediction === null) {
    // Fallback: a `Prediction...:` line in the response, then the assessment's `- Prediction:` line,
    // unless its text only points elsewhere. Never invented.
    const predRe = /^\s*(?:[-*]\s+)?(?:\*\*)?Prediction(?:,[^:]*?|\s[^:]*?)?:(?:\*\*)?\s+(.+)$/;
    for (const lines of [rLines, aLines]) {
      for (const l of lines) {
        const m = predRe.exec(l);
        if (m && clean(m[1]) !== '' && !isPointer(clean(m[1]))) {
          prediction = clean(m[1]);
          break;
        }
      }
      if (prediction !== null) break;
    }
  }
  if (prediction === null) {
    throw new RefusedError(`bearings ${date}: no "Check on <M/D H:MM AM/PM>: <prediction>" line in the response and no "Prediction:" line that states one`);
  }
  return {
    verdict, condition, nextAction, checkDate, prediction,
  };
}

export function buildBearingsToggle({ repo, readFile, readdirSync }) {
  const dir = path.join(repo, ...EVIDENCE_REL);
  const date = newestBearingsDate(readdirSync, dir);
  const aName = `${date}-bearings-assessment.md`;
  const rName = `${date}-bearings-response.md`;
  const assessment = readRequired(readFile, path.join(dir, aName), aName);
  const response = readRequired(readFile, path.join(dir, rName), rName);
  const b = parseBearings(assessment, response, date);
  const aUrl = `${REPO_BLOB_BASE}/docs/work/evidence/${aName}`;
  const rUrl = `${REPO_BLOB_BASE}/docs/work/evidence/${rName}`;
  const prose = [
    `Decision: ${b.verdict} (${date}).`,
    ...(b.condition ? [`Condition: ${b.condition}`] : []),
    `Next action: ${b.nextAction}`,
    b.checkDate === null ? `Prediction: ${b.prediction}` : `Prediction, check ${b.checkDate}: ${b.prediction}`,
  ];
  checkLines(prose.map(wrapBareFilenames), 'bearings');
  const links = `Links: [Goals page](${GOALS_PAGE_URL}), [assessment](${aUrl}), [response](${rUrl}).`;
  return toggleBlock('Bearings', [...prose.map(wrapBareFilenames), links]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────────

const PATH_RE = /`((?:skills|scripts|hooks)\/[^`\s]*)`/g;

/** Every backticked skills/, scripts/ or hooks/ path in a components.md line. */
export function componentPaths(text) {
  return [...String(text).matchAll(PATH_RE)].map((m) => m[1]);
}

export function parseComponents(text) {
  const body = String(text).replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
  const rows = [];
  for (const line of body.split('\n')) {
    if (line.trim() === '') continue;
    if (!/^- /.test(line)) throw new RefusedError(`docs/components.md: a line outside the header comment is not "- name | what | state | paths": ${line.slice(0, 80)}`);
    const fields = line.slice(2).split(' | ').map((s) => s.trim());
    if (fields.length < 3) throw new RefusedError(`docs/components.md: line is not "name | what it does | state | paths": ${line.slice(0, 80)}`);
    const [name, what, state, paths = ''] = fields;
    if (!COMPONENT_STATES.includes(state)) {
      throw new RefusedError(`docs/components.md: "${name}" has state "${state}", not one of ${COMPONENT_STATES.join(', ')}`);
    }
    rows.push({
      name, what, state, paths: componentPaths(line),
    });
  }
  if (rows.length === 0) throw new RefusedError('docs/components.md lists no component');
  return rows;
}

/** Refuses when a component names a skills/, scripts/ or hooks/ path that is absent from origin/main. */
export function checkComponentPaths(rows, { repo, execGit }) {
  const missing = [];
  for (const row of rows) {
    for (const rel of row.paths) {
      let out;
      try {
        out = execGit(['ls-tree', '--name-only', 'origin/main', '--', rel], repo);
      } catch (e) {
        throw new RefusedError(`docs/components.md: git ls-tree failed for ${rel} (${e instanceof Error ? e.message : e})`);
      }
      if (!String(out).trim()) missing.push(`${row.name}: ${rel}`);
    }
  }
  if (missing.length > 0) {
    throw new RefusedError(`docs/components.md names a path absent from origin/main (a stale component never publishes): ${missing.join('; ')}`);
  }
}

export function buildComponentsToggle({ repo, readFile, execGit }) {
  const text = readRequired(readFile, path.join(repo, 'docs', 'components.md'), 'docs/components.md');
  const rows = parseComponents(text);
  checkComponentPaths(rows, { repo, execGit });
  const lines = rows.map((r) => `- ${r.name} (${r.state}): ${r.what}`);
  checkLines(lines, 'components');
  return toggleBlock('Components', lines);
}
