import fs from 'node:fs';

export const TRANSCRIPT_TAIL_MAX_BYTES = 64 * 1024;
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
  if (meta?.type !== 'session_meta' || payload?.id !== input.session_id) return 'unknown';
  const spawn = payload?.source?.subagent?.thread_spawn;
  if (spawn !== undefined) {
    return opaque(spawn?.parent_thread_id)
      && CODEX_SESSION_ID_RE.test(spawn.parent_thread_id)
      && spawn.parent_thread_id !== input.session_id
      && Number.isInteger(spawn.depth)
      && spawn.depth >= 1 ? 'child' : 'unknown';
  }
  return payload?.source === 'cli' ? 'lead' : 'unknown';
}

/** Read a bounded byte tail and return only the latest structural true-user UUID. */
export function latestClaudeUser(input = {}, fsImpl = fs) {
  if (!opaque(input.transcript_path)) return null;
  let fd;
  try {
    fd = fsImpl.openSync(input.transcript_path, 'r');
    const stat = fsImpl.fstatSync(fd);
    if (!stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size < 0) return null;
    const length = Math.min(stat.size, TRANSCRIPT_TAIL_MAX_BYTES);
    const bytes = Buffer.alloc(length);
    const bytesRead = fsImpl.readSync(fd, bytes, 0, length, stat.size - length);
    let text = bytes.subarray(0, bytesRead).toString('utf8');
    if (stat.size > length) {
      const newline = text.indexOf('\n');
      if (newline < 0) return null;
      text = text.slice(newline + 1);
    }
    let latest = null;
    for (const line of text.split(/\r?\n/)) {
      if (!line || Buffer.byteLength(line) > TRANSCRIPT_TAIL_MAX_BYTES) continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      if (row?.type !== 'user' || row?.message?.role !== 'user' || row?.isMeta === true) continue;
      const content = row.message.content;
      if (typeof content !== 'string' || !opaque(row.uuid)) continue;
      latest = { uuid: row.uuid, parentUuid: opaque(row.parentUuid) ? row.parentUuid : null };
    }
    return latest;
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
    profile: supported ? 'codex-0.156.1-turn-v1' : null,
    ...(marker ? { bindRequestId: marker.requestId } : {}),
  };
}
