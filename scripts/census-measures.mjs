// census-measures — the shared measurement definitions the census instruments agree on
// (lane 62, docs/census.md "Token definition" and "Codex activity"). Pure functions: no fs,
// no transcript text. build-census, four-read and token-census all read tokens and top-tier
// membership through here so a number means the same thing in every report.
//
// node --test scripts/census-completeness-62.test.mjs

export const TOKEN_DEFINITION = Object.freeze({
  id: 'processed-v1',
  formula: 'processed = uncached input + cache read + cache creation + output, once per native request (claude); '
    + 'input + output with cached/cache-write input and reasoning output reported as subsets, never re-added (codex)',
});

// docs/model-tiers.md's cross-host default, applied per model regardless of the lead's host.
export const DEFAULT_TOP_TIER_MODELS = Object.freeze(['fable', 'opus', 'gpt-6-astra', 'gpt-5.6-sol']);
// Families docs/model-tiers.md names as below the top tier. Anything else is unclassified.
export const KNOWN_NON_TOP_FAMILIES = Object.freeze(['sonnet', 'haiku', 'gpt-5.6-terra', 'gpt-5.6-luna', 'codex-spark']);

function isCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function requireCount(usage, name, optional) {
  const value = usage[name];
  if (value === undefined && optional) return 0;
  if (!isCount(value)) throw new Error(`invalid token vector: ${name} must be a finite non-negative number`);
  return value;
}

/**
 * processed-v1 total for one native request's usage vector. Throws on a negative, non-finite or
 * missing required category, never coerces it to zero. Codex: cached + cache-write input must not
 * exceed input and reasoning must not exceed output (both are subsets). Claude: a nested
 * cache_creation breakdown is a subset of cache_creation_input_tokens and is never added.
 */
export function processedTokenTotal(host, usage) {
  if (host !== 'claude' && host !== 'codex') throw new Error(`invalid token vector: unknown host ${String(host)}`);
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) throw new Error('invalid token vector: usage is not an object');
  const input = requireCount(usage, 'input_tokens', false);
  const output = requireCount(usage, 'output_tokens', false);
  if (host === 'claude') {
    const created = requireCount(usage, 'cache_creation_input_tokens', true);
    const read = requireCount(usage, 'cache_read_input_tokens', true);
    const nested = usage.cache_creation;
    if (nested !== undefined && nested !== null) {
      if (typeof nested !== 'object' || Array.isArray(nested)) throw new Error('invalid token vector: cache_creation breakdown is not an object');
      let subset = 0;
      for (const value of Object.values(nested)) {
        if (!isCount(value)) throw new Error('invalid token vector: cache_creation breakdown has an invalid category');
        subset += value;
      }
      if (subset > created) throw new Error('invalid token vector: cache_creation breakdown exceeds cache_creation_input_tokens');
    }
    return input + created + read + output;
  }
  const cached = requireCount(usage, 'cached_input_tokens', true);
  const cacheWrite = requireCount(usage, 'cache_write_input_tokens', true);
  const reasoning = requireCount(usage, 'reasoning_output_tokens', true);
  if (cached + cacheWrite > input) throw new Error('invalid token vector: cached + cache-write input exceeds input');
  if (reasoning > output) throw new Error('invalid token vector: reasoning output exceeds output');
  return input + output;
}

/** The configured top-tier list: DELEGATION_TOP_TIER when set, else the cross-host default. */
export function topTierModelList(env = process.env) {
  const configured = env && env.DELEGATION_TOP_TIER;
  const list = configured ? configured.split(',') : DEFAULT_TOP_TIER_MODELS;
  return list.map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** true = top tier, false = a known family outside the (configured) top list, null = unclassified (never silently "mid").
 * DELEGATION_TOP_TIER is a filter: a configured match is true (even an otherwise unknown name, by explicit override),
 * and any other KNOWN family (default top or lower) is false, so configuring gpt-6-astra excludes Claude Opus
 * without making the cell unavailable. Only genuinely unknown families are null. */
export function isTopTierModel(model, configuredModels) {
  if (typeof model !== 'string' || !model.trim()) return null;
  const name = model.toLowerCase();
  const tiers = Array.isArray(configuredModels) && configuredModels.length
    ? configuredModels.map((s) => String(s).trim().toLowerCase()).filter(Boolean)
    : topTierModelList();
  if (tiers.some((tier) => name.includes(tier))) return true;
  if (KNOWN_NON_TOP_FAMILIES.some((family) => name.includes(family))) return false;
  if (DEFAULT_TOP_TIER_MODELS.some((family) => name.includes(family))) return false;
  return null;
}

// ── Codex activity ─────────────────────────────────────────────────────────────────────────
// Pure interval classifier over already-parsed native lifecycle events. build-census reads the
// rows (LF framing, every verified lead segment) and keeps only ids, instants and row numbers.
export const ACTIVITY_THRESHOLD_MS = 7200000;

/**
 * events: [{ms, row, seq, kind: 'start'|'complete'|'call'|'output'|'other', turnId?, rootTurnId?, callId?}]
 *   seq orders events that share an instant (file order, segments in discovery order).
 * window: {fromMs: number|null, toMs: number|null}; corruptRows: count of unparsable relevant rows.
 * Returns the CodexActivity contract (docs/specs/census-completeness-62/contracts.d.ts).
 */
export function computeCodexActivity(events, { fromMs = null, toMs = null, corruptRows = 0 } = {}) {
  const reasons = [];
  const addReason = (text) => { if (!reasons.includes(text)) reasons.push(text); };
  const base = { thresholdMs: ACTIVITY_THRESHOLD_MS, causalAttribution: 'UNSUPPORTED', intervals: [] };
  const lifecycle = events.filter((e) => e.kind === 'start' || e.kind === 'complete');
  if (!lifecycle.length) {
    return { ...base, coverage: 'unavailable', reasons: ['no task_started/task_complete lifecycle rows'],
      observedSilentGaps: null, toolRunningGaps: null, baselineRuleGaps: null };
  }
  if (corruptRows > 0) addReason(`corrupt rows: ${corruptRows}`);
  // Stable order: instant, then file order. A timestamp reversal alone is not a contradiction.
  const sorted = events.slice().sort((a, b) => a.ms - b.ms || a.seq - b.seq);
  const turns = new Map(); // turnId -> {state: 'open'|'closed'|'unobserved', startMs}
  const tools = new Map(); // callId -> {turnId, open}
  const seenStart = new Map();
  const seenComplete = new Map();
  const seenCall = new Map();
  const seenOutput = new Map();
  const intervals = [];
  const closeToolsOf = (turnId) => { for (const tool of tools.values()) if (tool.turnId === turnId) tool.open = false; };
  const innermostOpenTurn = () => {
    let best = null;
    for (const [id, turn] of turns) if (turn.state === 'open' && (best === null || turn.startMs >= turns.get(best).startMs)) best = id;
    return best;
  };
  const classify = () => {
    const open = [...turns].filter(([, turn]) => turn.state === 'open').map(([id]) => id);
    const openCalls = [...tools].filter(([, tool]) => tool.open && turns.get(tool.turnId) && turns.get(tool.turnId).state === 'open').map(([id]) => id);
    if (open.length) return { kind: openCalls.length ? 'tool-running' : 'in-turn-silence', turnIds: open, callIds: openCalls };
    const stale = [...turns].filter(([, turn]) => turn.state === 'unobserved').map(([id]) => id);
    if (stale.length) return { kind: 'unknown', turnIds: stale, callIds: [] };
    return { kind: 'between-turns', turnIds: [], callIds: [] };
  };
  const emit = (fromEdge, toEdge, state, sourceRows, rightCensored) => {
    const a = Math.max(fromEdge, fromMs ?? -Infinity);
    const b = Math.min(toEdge, toMs ?? Infinity);
    if (!(b > a) || b - a <= ACTIVITY_THRESHOLD_MS) return;
    intervals.push({ from: new Date(a).toISOString(), to: new Date(b).toISOString(), durationMs: b - a, kind: state.kind,
      rightCensored, turnIds: state.turnIds.slice().sort(), callIds: state.callIds.slice().sort(), sourceRows });
  };
  let previous = null;
  for (const event of sorted) {
    // A new, unrelated turn proves the silence before it belonged to a predecessor whose end was never observed:
    // that interval is `unknown` (counts for the baseline event-gap rule only), never in-turn silence or tool-running.
    let supersededIds = [];
    if (event.kind === 'start' && !seenStart.has(event.turnId)) {
      const nestedIn = event.rootTurnId && event.rootTurnId !== event.turnId && turns.get(event.rootTurnId) && turns.get(event.rootTurnId).state === 'open';
      if (!nestedIn) supersededIds = [...turns].filter(([, turn]) => turn.state === 'open').map(([id]) => id);
    }
    if (previous) {
      const state = supersededIds.length && (previous.state.kind === 'in-turn-silence' || previous.state.kind === 'tool-running')
        ? { kind: 'unknown', turnIds: supersededIds, callIds: [] }
        : previous.state;
      emit(previous.ms, event.ms, state, [previous.row, event.row], false);
    }
    if (event.kind === 'start') {
      const known = seenStart.get(event.turnId);
      if (known !== undefined && known !== event.ms) addReason(`turn ${event.turnId} has conflicting task_started rows`);
      if (known === undefined) {
        seenStart.set(event.turnId, event.ms);
        // Nested only when the row's own root_turn_id names an open turn; a shared root alone proves nothing.
        const nestedIn = event.rootTurnId && event.rootTurnId !== event.turnId && turns.get(event.rootTurnId) && turns.get(event.rootTurnId).state === 'open';
        if (!nestedIn) {
          for (const [id, turn] of turns) {
            if (turn.state !== 'open') continue;
            turn.state = 'unobserved';
            closeToolsOf(id);
            addReason(`turn ${id} end unobserved`);
          }
        }
        if (seenComplete.has(event.turnId)) addReason(`turn ${event.turnId} complete before start`);
        turns.set(event.turnId, { state: 'open', startMs: event.ms });
      }
    } else if (event.kind === 'complete') {
      const known = seenComplete.get(event.turnId);
      if (known !== undefined && known !== event.ms) addReason(`turn ${event.turnId} has conflicting task_complete rows`);
      if (known === undefined) {
        seenComplete.set(event.turnId, event.ms);
        if (!turns.has(event.turnId)) addReason(`turn ${event.turnId} complete before start`);
        else { turns.get(event.turnId).state = 'closed'; closeToolsOf(event.turnId); }
      }
    } else if (event.kind === 'call') {
      const known = seenCall.get(event.callId);
      if (known !== undefined && known !== event.ms) addReason(`call ${event.callId} has conflicting call rows`);
      if (known === undefined) {
        seenCall.set(event.callId, event.ms);
        const owner = event.turnId && turns.has(event.turnId) ? event.turnId : innermostOpenTurn();
        if (owner !== null) tools.set(event.callId, { turnId: owner, open: turns.get(owner).state === 'open' });
        if (seenOutput.has(event.callId)) addReason(`call ${event.callId} output before call`);
      }
    } else if (event.kind === 'output') {
      const known = seenOutput.get(event.callId);
      if (known !== undefined && known !== event.ms) addReason(`call ${event.callId} has conflicting output rows`);
      if (known === undefined) {
        seenOutput.set(event.callId, event.ms);
        if (!seenCall.has(event.callId)) addReason(`call ${event.callId} output before call`);
        else if (tools.has(event.callId)) tools.get(event.callId).open = false;
      }
    }
    previous = { ms: event.ms, row: event.row, state: classify() };
  }
  // Right censoring: only an OBSERVED open turn idles up to the fixed window end; a closed turn never does.
  if (previous && toMs !== null && toMs > previous.ms && (previous.state.kind === 'in-turn-silence' || previous.state.kind === 'tool-running')) {
    emit(previous.ms, toMs, previous.state, [previous.row], true);
  }
  const counts = (pick) => intervals.filter(pick).length;
  return {
    ...base,
    coverage: reasons.length ? 'PARTIAL' : 'complete',
    reasons,
    intervals,
    observedSilentGaps: counts((i) => i.kind === 'in-turn-silence'),
    toolRunningGaps: counts((i) => i.kind === 'tool-running'),
    // The baseline's rule: every consecutive-event gap of any kind over 2 h. An artificial window end is not an event.
    baselineRuleGaps: counts((i) => !i.rightCensored),
  };
}
