// Codex session role (lead / child / unknown) from native session metadata. Kept when the
// continuation runtime was retired: multi-codex-hook.mjs still needs it to tell a native subagent
// from a lead.
import fs from 'node:fs';

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
