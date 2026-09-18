// test-child-env — the ONE way this suite builds an environment for a child process.
//
// TEST SUPPORT, not part of the protocol: nothing in `note-*` or `hooks/` imports it. It lives beside
// the tests because the mirror publishes this directory wholesale, and a helper the tests can reach
// without a relative climb is what makes the rule below cheap enough that nobody works around it.
//
// THE RULE: a test child must never inherit the environment of the session RUNNING the suite.
//
// That session is a Claude Code session. It exports `CLAUDE_CODE_MESSAGING_SOCKET` and
// `CLAUDE_CODE_MESSAGING_TOKEN` - its own inbox and the credential that lets any holder start a turn in
// it - to everything it spawns, and its `HOME` holds Ben's real `~/.agents/notes`. On 2026-09-17 a
// hook child inherited both and wrote the running session's token into a `%TEMP%` fixture, silently,
// while the test passed. A later review found three more spawn sites that were safe only because of
// what they happened to be testing.
//
// So: one helper, every spawn site through it, and `no test file inherits the runner's environment` in
// `hooks.test.mjs` fails if a new site spreads `process.env` on its own.
import os from 'node:os';

/** Blanked in every child, whatever else the caller passes. */
export const SEALED = Object.freeze({
  CLAUDE_CODE_MESSAGING_SOCKET: '',
  CLAUDE_CODE_MESSAGING_TOKEN: '',
});

/**
 * The environment for a child process: the runner's, with the home pointed at a fixture and this
 * session's inbox credential removed.
 *
 * @param {string} home     fixture HOME; also USERPROFILE, because `os.homedir()` reads that on Windows
 * @param {object} over     anything the individual test needs on top
 */
export function childEnv(home, over = {}) {
  return {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    ...SEALED,
    ...over,
  };
}

/** A fixture home for a child that does not otherwise need one, so `childEnv` is never called bare. */
export function scratchHome(fsImpl, prefix = 'child-env-') {
  return fsImpl.mkdtempSync(`${os.tmpdir()}/${prefix}`);
}
