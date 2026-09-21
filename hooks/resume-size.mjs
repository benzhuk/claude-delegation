// node --test "hooks/*.test.mjs"
//
// resume-size — reads at most the last 256 KB of a subagent transcript (`.jsonl`) file and
// returns its context size from the LAST assistant `usage` block, or null.
//
// Split out of agent-dispatch-guard.mjs (build 0921 Territory C) purely to keep that file
// under its line budget; this module owns only the "how big is the tail, and what does it
// say" question. Pinned by spec.md section C: "read at most the last 256 KB... last
// assistant usage... context = input_tokens + cache_creation_input_tokens +
// cache_read_input_tokens." A transcript can be tens of megabytes (a long-running builder);
// this file exists so that number never gets read whole to answer a one-line question.
//
// `fsImpl` is always injected by the caller (never a bare `import fs from 'node:fs'` here) —
// same pattern as agent-dispatch-guard.mjs's `ctx.fsImpl`. Any error, missing file, empty
// tail, or no usage found: return null. This module never throws.

export const TAIL_BYTES = 256 * 1024;

/**
 * Read at most the last `maxBytes` of `filePath` via `fsImpl`, fd-based so a large file is
 * never read whole — only `statSync` (to find the size) and one bounded `readSync` touch it.
 */
export function readTail(fsImpl, filePath, maxBytes = TAIL_BYTES) {
  const size = fsImpl.statSync(filePath).size;
  const start = Math.max(0, size - maxBytes);
  const length = size - start;
  if (length <= 0) return '';
  const fd = fsImpl.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    fsImpl.readSync(fd, buffer, 0, length, start);
    return buffer.toString('utf8');
  } finally {
    try { fsImpl.closeSync(fd); } catch { /* best effort close */ }
  }
}

/** Sum the three usage fields the spec pins; missing fields count as 0. Non-numeric or a
 * non-object `usage` returns null (no usage found on this line). */
function usageContextTokens(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const input = Number(usage.input_tokens) || 0;
  const cacheCreate = Number(usage.cache_creation_input_tokens) || 0;
  const cacheRead = Number(usage.cache_read_input_tokens) || 0;
  const total = input + cacheCreate + cacheRead;
  return Number.isFinite(total) ? total : null;
}

/**
 * Returns the context size (integer tokens) from the LAST `{"type":"assistant",...}` line
 * with a `message.usage` block found in the tail of `filePath`, or null on any error,
 * missing file, empty/unreadable tail, a truncated leading line (from the tail cut), or no
 * assistant usage anywhere in the tail.
 */
export function readContextTokens(fsImpl, filePath, maxBytes = TAIL_BYTES) {
  let text;
  try {
    text = readTail(fsImpl, filePath, maxBytes);
  } catch {
    return null;
  }
  if (!text) return null;

  let last = null;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue; // a truncated first line (cut mid-record by the tail read), or any
      // otherwise malformed line: skip it, it is not fatal to the ones after it.
    }
    if (entry?.type !== 'assistant') continue;
    const tokens = usageContextTokens(entry?.message?.usage);
    if (tokens !== null) last = tokens;
  }
  return last;
}
