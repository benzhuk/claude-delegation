// session-name — a Claude Code session's own name, read from the sidecar `/rename` writes.
//
// D1/D2 (spec rename-build 2026-09-22): `/rename <name>` and `claude --name <name>` both write
// `<dirname(transcript_path)>/<session_id>/custom-title.json` = `{"customTitle":"<name>"}`. There is no
// rename HOOK event, so this module is read directly at the existing hook events instead of waiting for
// one. It reads exactly ONE file — never the transcript itself (a live transcript can be tens of MB, and
// the machine-generated `ai-title` event inside it is a GUESS, which rule 4 of the hooks it feeds
// forbids using).
//
// NEVER call toPosix() on `transcriptPath` before the fs read here — that habit is everywhere else in
// this codebase, and `fs.readFileSync`/`fs.existsSync` want the platform-native path, not a posix-forced
// one. The sidecar path is built with `path.dirname` + `path.join` on the RAW string Claude Code hands
// this hook on stdin.

import fs from 'node:fs';
import path from 'node:path';

/** MINOR (addendum 2): a slug this long after normalisation reads as unnamed, not truncated. */
export const MAX_SLUG_LEN = 64;

/** MINOR (addendum 2): `envelope.mjs`'s `RESERVED_RECIPIENT` — a session renamed "Ben" must not
 * register a real inbox entry under the reserved slug. Not imported from there on purpose: this module
 * has no other dependency on the note protocol, and the reserved word itself never changes independently
 * of this file. */
const RESERVED_RECIPIENT = 'ben';

/**
 * `customTitle` -> trim -> lowercase -> runs of whitespace or `_` -> single `-` -> drop everything
 * outside `[a-z0-9-]` -> collapse `--` -> strip leading/trailing `-`. An empty result means unnamed.
 */
export function normalizeSlug(title) {
  if (typeof title !== 'string') return '';
  return title
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * This session's own name, or null when it has none — a missing sidecar, an unparseable one, a
 * normalised-empty title, a normalised title over 64 chars, or the reserved word `ben` are ALL "no
 * name", not distinct states a caller needs to tell apart.
 *
 * @param {{ transcriptPath: string, sessionId: string, fs?: object }} args
 * @returns {{ title: string, slug: string, path: string } | null}
 */
export function readSessionName({ transcriptPath, sessionId, fs: fsImpl = fs } = {}) {
  if (!transcriptPath || !sessionId) return null;
  // The RAW string, never toPosix'd — see the file header. `path.dirname(transcriptPath)` is the
  // PROJECT directory (the scout's own correction to this build's original path assumption: the
  // transcript itself lives in that directory, one level above the sidecar's own session-id subdir).
  const sidecarPath = path.join(path.dirname(transcriptPath), String(sessionId), 'custom-title.json');

  let raw;
  try {
    raw = fsImpl.readFileSync(sidecarPath, 'utf8');
  } catch {
    // ENOENT (no sidecar) or anything else unreadable: unnamed, full stop. Never grep the transcript.
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null; // bad JSON is unnamed, not a throw out of a hook
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.customTitle !== 'string') return null;

  const title = parsed.customTitle;
  const slug = normalizeSlug(title);
  if (!slug) return null; // D2: empty after normalisation = unnamed, not present-but-empty
  if (slug.length > MAX_SLUG_LEN) return null;
  if (slug === RESERVED_RECIPIENT) return null;

  return { title, slug, path: sidecarPath };
}
