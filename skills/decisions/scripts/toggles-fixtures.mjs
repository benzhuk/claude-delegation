/**
 * Shared test fixtures for the three agent-owned toggles (Goal card, Bearings, Components) that
 * `render()` now requires of every repo it renders (lane 72). A test helper, not production code:
 * the suites that build a fake repo spread `toggleFiles(join, repo)` into it and wrap their
 * `execGit` fake with `withTogglesGit()`.
 */
import path from 'node:path';

export const CARD_SHA = 'abc1234';

export const CARD_TEXT = [
  'GOAL: Agent work gets cheaper, faster and more reliable at equal or better quality.',
  'NOT: waiting to be asked. NOT: a rule no script checks.',
  'DONE: a build goes spec to accepted through the plugin.',
  'STOP: bearings says RE-PLAN twice in a row or CUT: stop that lane.',
  'SOURCE: docs/GOALS.md',
  '',
].join('\n');

export const BEARINGS_ASSESSMENT = [
  'CONTINUE',
  '',
  '# Bearings, 2026-10-01',
  '',
  '- Decision: `CONTINUE`.',
  '  - Condition: if by 10/2 3:00 PM no census read exists on origin, the next bearings returns RE-PLAN on the cost line.',
  '- Next action: run the prediction check at 3:00 PM today with the existing census script. Then spec plan item 6.',
  '- Prediction: see below.',
  '',
].join('\n');

export const BEARINGS_RESPONSE = [
  '# Lead response',
  '',
  'I accept the verdict.',
  '',
  'Check on 10/2 3:00 PM: origin main holds the window read and the item 6 spec, or the cost line gets RE-PLAN.',
  '',
].join('\n');

export const COMPONENTS_TEXT = [
  '<!--',
  'Components of the plugin, one line each. State words: fed, measured, unfed, partial, missing.',
  '-->',
  '- Decisions page | Puts what only Ben can decide where he reads | fed | `skills/decisions/`, `skills/decisions/scripts/decisions-render.mjs`',
  '- Build census | Counts top-tier tokens and hours per build | measured | `scripts/build-census.mjs`',
  '- Research | A source-preserving research route | missing',
  '',
].join('\n');

/** The fake repo's files for the three toggles, keyed by `join(repo, ...segments)`. */
export function toggleFiles(join, repo, overrides = {}) {
  const evidence = (name) => join(repo, 'docs', 'work', 'evidence', name);
  return {
    [join(repo, 'docs', 'goals', 'card.md')]: CARD_TEXT,
    [join(repo, 'docs', 'components.md')]: COMPONENTS_TEXT,
    [evidence('2026-10-01-bearings-assessment.md')]: BEARINGS_ASSESSMENT,
    [evidence('2026-10-01-bearings-response.md')]: BEARINGS_RESPONSE,
    ...overrides,
  };
}

/** Wraps an `execGit` fake: `log` (the card sha) answers CARD_SHA, `ls-tree` of a skills/,
 * scripts/ or hooks/ path answers the path back unless it is listed in `absent`; anything else
 * goes to the wrapped fake. */
export function withTogglesGit(inner, { absent = [], sha = CARD_SHA } = {}) {
  return (args, cwd) => {
    if (args[0] === 'log') return `${sha}\n`;
    if (args[0] === 'ls-tree') {
      const rel = args[args.length - 1];
      if (/^(skills|scripts|hooks)\//.test(rel)) return absent.includes(rel) ? '' : rel;
    }
    return inner(args, cwd);
  };
}

export const joinPath = path.join;
