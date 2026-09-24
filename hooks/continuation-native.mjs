import fs from 'node:fs';

export const TRANSCRIPT_TAIL_MAX_BYTES = 64 * 1024;
export const TRANSCRIPT_SCAN_MAX_BYTES = 8 * 1024 * 1024;
export const TRANSCRIPT_ROW_MAX_BYTES = 1024 * 1024;
const CODEX_SESSION_ID_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const OPAQUE_RE = /^[^\r\n\0]{1,512}$/;

function opaque(value) {
  return typeof value === 'string' && OPAQUE_RE.test(value);
}

function readFirstJsonLine(file, fsImpl = fs, maxBytes = 256 * 1024) {
  let fd;
  try {
    fd = fsImpl.openSync(file, 'r');
    const stat = fsImpl.fstatSync(fd);
    if (!stat.isFile() || stat.size <= 0) return null;
    const parts = []; let total = 0;
    while (total <= maxBytes) {
      const length = Math.min(8 * 1024, maxBytes + 1 - total);
      const bytes = Buffer.alloc(length);
      const read = fsImpl.readSync(fd, bytes, 0, length, total);
      if (!read) return null;
      const chunk = bytes.subarray(0, read);
      const newline = chunk.indexOf(0x0a);
      if (newline >= 0) {
        if (total + newline > maxBytes) return null;
        parts.push(chunk.subarray(0, newline));
        return JSON.parse(Buffer.concat(parts).toString('utf8'));
      }
      parts.push(chunk); total += read;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) try { fsImpl.closeSync(fd); } catch {}
  }
}

/** Lead/child/unknown from native session metadata. Pane identity never participates. */
export function classifyCodexRole(input = {}, fsImpl = fs) {
  if (!opaque(input.session_id) || !opaque(input.transcript_path)) return 'unknown';
  const meta = readFirstJsonLine(input.transcript_path, fsImpl);
  const payload = meta?.payload;
  if (meta?.type !== 'session_meta' || !opaque(payload?.id)) return 'unknown';
  const spawn = payload?.source?.subagent?.thread_spawn;
  if (spawn !== undefined) {
    // Child callbacks carry the parent session id and an agent_id naming the child transcript.
    // Bind that explicit identity to the persisted spawn record; ancestry may be deeper than one.
    const parentThreadId = spawn?.parent_thread_id;
    const validSpawn = opaque(parentThreadId)
      && CODEX_SESSION_ID_RE.test(parentThreadId)
      && parentThreadId !== payload.id
      && Number.isInteger(spawn.depth)
      && spawn.depth >= 1;
    const nativeParentSession = payload.session_id === input.session_id
      && opaque(input.agent_id)
      && input.agent_id === payload.id
      && payload.id !== input.session_id;
    const legacyOwnSession = payload.id === input.session_id
      && input.agent_id == null
      && (payload.session_id == null || payload.session_id === input.session_id)
      && parentThreadId !== input.session_id;
    return CODEX_SESSION_ID_RE.test(payload.id)
      && CODEX_SESSION_ID_RE.test(input.session_id)
      && validSpawn
      && (nativeParentSession || legacyOwnSession) ? 'child' : 'unknown';
  }
  return (payload.session_id == null || payload.session_id === input.session_id)
    && input.agent_id == null && payload.id === input.session_id && ['cli', 'vscode'].includes(payload?.source)
    ? 'lead' : 'unknown';
}

function trueClaudeUser(line) {
  if (!line.length) return undefined;
  if (line.length > TRANSCRIPT_ROW_MAX_BYTES) return null;
  if (line.at(-1) === 0x0d) line = line.subarray(0, -1);
  let row;
  try { row = JSON.parse(line.toString('utf8')); } catch { return null; }
  if (row?.type !== 'user' || row?.message?.role !== 'user' || row?.isMeta === true) return undefined;
  if (typeof row.message.content !== 'string' || !opaque(row.uuid)) return undefined;
  return { uuid: row.uuid, parentUuid: opaque(row.parentUuid) ? row.parentUuid : null };
}

/** Scan backward in bounded chunks and return only the latest structural true-user UUID. */
export function latestClaudeUser(input = {}, fsImpl = fs) {
  if (!opaque(input.transcript_path)) return null;
  let fd;
  try {
    fd = fsImpl.openSync(input.transcript_path, 'r');
    const stat = fsImpl.fstatSync(fd);
    if (!stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size < 0) return null;
    let position = stat.size;
    let scanned = 0;
    let carry = Buffer.alloc(0);
    while (position > 0 && scanned < TRANSCRIPT_SCAN_MAX_BYTES) {
      const length = Math.min(TRANSCRIPT_TAIL_MAX_BYTES, position, TRANSCRIPT_SCAN_MAX_BYTES - scanned);
      position -= length;
      const bytes = Buffer.alloc(length);
      const bytesRead = fsImpl.readSync(fd, bytes, 0, length, position);
      if (bytesRead !== length) return null;
      scanned += bytesRead;
      const joined = carry.length ? Buffer.concat([bytes, carry]) : bytes;
      let end = joined.length;
      while (end > 0) {
        const newline = joined.lastIndexOf(0x0a, end - 1);
        if (newline < 0) break;
        const found = trueClaudeUser(joined.subarray(newline + 1, end));
        if (found === null) return null;
        if (found) return found;
        end = newline;
      }
      carry = joined.subarray(0, end);
      if (carry.length > TRANSCRIPT_ROW_MAX_BYTES) return null;
    }
    if (position !== 0) return null;
    const found = trueClaudeUser(carry);
    return found ?? null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) try { fsImpl.closeSync(fd); } catch {}
  }
}

function transcriptBoundary(input, fsImpl) {
  if (!opaque(input.transcript_path)) return null;
  try {
    const stat = fsImpl.statSync(input.transcript_path);
    if (!stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size < 0) return null;
    return `${stat.size}:${Math.trunc(stat.mtimeMs)}`;
  } catch {
    return null;
  }
}

/** Accept the bind marker only from the actual PostToolUse response value. */
export function continuationBindMarker(toolResponse) {
  let value = toolResponse;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (value && typeof value === 'object' && typeof value.stdout === 'string') {
    if ((typeof value.stderr === 'string' && value.stderr.trim()) || value.interrupted === true) return null;
    try { value = JSON.parse(value.stdout.trim()); } catch { return null; }
  }
  const marker = value?.continuationBind;
  return opaque(marker?.requestId) && opaque(marker?.epoch)
    ? { requestId: marker.requestId, epoch: marker.epoch }
    : null;
}

export function normalizeClaudeContinuation(input = {}, fsImpl = fs) {
  const event = input.hook_event_name;
  if (!['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Stop'].includes(event) || !opaque(input.session_id)) return null;
  const role = opaque(input.agent_id) ? 'child' : (input.agent_id == null ? 'lead' : 'unknown');
  const latest = ['PostToolUse', 'Stop'].includes(event) ? latestClaudeUser(input, fsImpl) : null;
  const boundary = event === 'UserPromptSubmit' ? transcriptBoundary(input, fsImpl) : null;
  const episodeKey = latest?.uuid ?? null;
  const eventKey = event === 'UserPromptSubmit'
    ? (boundary ? `prompt:${boundary}` : null)
    : event === 'SessionStart'
      ? `session:${String(input.source ?? 'unknown')}`
      : (episodeKey ? `${event}:${episodeKey}` : null);
  const marker = event === 'PostToolUse' ? continuationBindMarker(input.tool_response) : null;
  return {
    host: 'claude', event, sessionId: input.session_id, episodeKey, eventKey, role,
    stopHookActive: input.stop_hook_active === true,
    cancellation: event === 'Stop' ? false : null,
    cancellationVerified: true,
    peerWillBlock: false,
    // Contract profile: native 2.1.281 SDK/print callbacks supplied the executable observation;
    // Claude's documented Stop contract supplies the host-wide interruption boundary. This does not
    // claim a separate TUI observation, and activation still requires the structural UUID + bind marker.
    profile: 'claude-code-stop-v1',
    ...(marker ? { bindRequestId: marker.requestId } : {}),
  };
}

export function normalizeCodexContinuation(input = {}, fsImpl = fs, { supported = false } = {}) {
  const event = input.hook_event_name;
  if (!['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Stop', 'Interrupt'].includes(event)
    || !opaque(input.session_id)) return null;
  const role = classifyCodexRole(input, fsImpl);
  const turnId = opaque(input.turn_id) ? input.turn_id : null;
  const marker = event === 'PostToolUse' ? continuationBindMarker(input.tool_response) : null;
  return {
    host: 'codex', event, sessionId: input.session_id,
    episodeKey: turnId,
    eventKey: turnId ? `${event}:${turnId}` : null,
    role,
    stopHookActive: input.stop_hook_active === true,
    cancellation: event === 'Interrupt' ? true : (event === 'Stop' ? false : null),
    cancellationVerified: supported,
    peerWillBlock: false,
    profile: supported ? 'codex-native-turn-v1' : null,
    ...(marker ? { bindRequestId: marker.requestId } : {}),
  };
}
