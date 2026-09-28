// Shared goal-card and bearings advisory for native host adapters.
//
// This module owns wording only. Event cadence, native identity and output shaping remain the
// host adapter's responsibility.

import { goalCardResult, rejectionNotice as goalCardRejectionNotice, wantsReportLine, SUBAGENT_SUFFIX } from '../../scripts/goal-card.mjs';

/** @returns {Promise<{text: string|null, reason: string|null, path: string|null, status: string}>} */
export async function cardResult(cwd, agentType, { env = process.env } = {}) {
  try {
    const extra = wantsReportLine(agentType) ? SUBAGENT_SUFFIX : undefined;
    return goalCardResult(cwd || process.cwd(), extra ? { extra, env } : { env });
  } catch {
    return { status: 'blind', text: null, reason: null, path: null };
  }
}

export async function rejectionNotice(result) {
  try {
    return goalCardRejectionNotice(result.path, result.reason);
  } catch {
    return null;
  }
}

export async function bearingsNotice(cwd, { env = process.env } = {}) {
  try {
    const { check: checkBearings } = await import('../../skills/bearings/scripts/bearings-state.mjs');
    // Lane 47, P8: the receipt is keyed on the project's MAIN checkout (bearings-state.mjs's own
    // `goalLocation` walks up from `repo` to the nearest `.git`/`.agents/project.json` — a linked
    // worktree has its OWN `.git` file, so it stops there and keys the receipt on the worktree
    // instead). Resolve `cwd` to the main checkout the SAME way the receipt writer's own repo arg
    // is expected to be given, so every worktree of a repository reads the one receipt written for
    // it, never a worktree-keyed one that never matches. Optional, same as bearings-state itself
    // above: a copied helper without skills/multi (or without git) must keep working with the
    // given cwd, never throw.
    const given = cwd || process.cwd();
    let repo = given;
    try {
      const { mainCheckout, gitRunner } = await import('../../skills/multi/scripts/transport.mjs');
      repo = mainCheckout(given, gitRunner) ?? given;
    } catch { /* no transport.mjs here, or git could not answer: check against the given cwd as-is */ }
    let checked = checkBearings({ repo, env });
    // A receipt completed from inside a worktree is keyed on that worktree: still honour it.
    if (checked.status !== 'current' && repo !== given) {
      const own = checkBearings({ repo: given, env });
      if (own.status === 'current') checked = own;
    }
    if (checked.status === 'due' && checked.reason === 'reviewer-not-independent') {
      return 'Bearings are due: the last receipt\'s reviewer was not independent of the lead. Run `/delegation:bearings` with a different reviewer.';
    }
    if (checked.status === 'due') return 'Bearings are due. Run `/delegation:bearings` to assess the current goal and publish the result.';
    if (checked.status === 'unknown') return 'Bearings status is unknown. Run `/delegation:bearings` to inspect the current goal and completion evidence.';
  } catch {}
  return null;
}

export function leadIdHint(sessionId) {
  return typeof sessionId === 'string' && sessionId
    ? `When recording completion, pass --lead-id ${sessionId} (this session) and, as --reviewer-id, the agentId the Agent tool returned for the reviewer (or the reviewer pane's own session id), never this session id.`
    : null;
}
