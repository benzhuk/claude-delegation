// Shared goal-card and bearings advisory for native host adapters.
//
// This module owns wording only. Event cadence, native identity and output shaping remain the
// host adapter's responsibility.

import { goalCardResult, rejectionNotice as goalCardRejectionNotice, wantsReportLine, SUBAGENT_SUFFIX } from '../../scripts/goal-card.mjs';
import { check as checkBearings } from '../../skills/bearings/scripts/bearings-state.mjs';

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
    const checked = checkBearings({ repo: cwd, env });
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
