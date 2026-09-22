// scripts/test-home.mjs
//
// The ONE way a test (or `scripts/run-tests.mjs`) builds a sealed fake home: a fresh, disposable
// temp directory that stands in for HOME (and USERPROFILE, since `os.homedir()` reads that on
// Windows), with AGENTS_HOME pointed underneath it, and - when asked - a git identity that ONLY
// resolves for repos created under the system temp dir, never for a real repo. That scoping is the
// point (C5): a commit inside a fixture repo under the temp dir gets an identity; a commit attempted
// anywhere else under the seal has none and fails loudly, so the seal (which hides `core.hooksPath`
// and every other global git setting, via GIT_CONFIG_GLOBAL + GIT_CONFIG_NOSYSTEM) never becomes a
// way to bypass the machine's real git-identity guard for a real repo.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { childEnv } from "../skills/multi/scripts/test-child-env.mjs";

/** Forward slashes always, even on Windows: git's `gitdir` include patterns and `path =` values are
 * matched/read as POSIX-style paths. */
function toGitPath(p) {
  return p.split(path.sep).join("/");
}

/**
 * Build a fresh sealed home for a test (or a child process the test spawns).
 *
 * IMPORTANT for callers who then create a fixture repo to commit into (T1, T3): the
 * `includeIf "gitdir/i:..."` pattern this seeds only matches a gitdir that is itself under the
 * REALPATH of `os.tmpdir()` (A3, spec-addendum-r3.md). Build every fixture repo with
 * `fs.mkdtempSync(path.join(os.tmpdir(), <prefix>))` - never inside this repo, a project scratch
 * path, or any other location - or the commit you make in it gets no identity and git refuses it.
 * The pattern and the `path =` value are always written with forward slashes, even on Windows
 * (a backslash in a git config value is an escape sequence and silently mis-resolves) - `toGitPath`
 * below is the one place that conversion happens; a caller does not need to repeat it.
 *
 * @param {object} [opts]
 * @param {Record<string,string>} [opts.files]  relative-path -> content, written under the new home
 *   before `env`/`cleanup` are handed back (e.g. seeding `.agents/...` state for a test).
 * @param {boolean} [opts.gitIdentity=true]  seed the fixture git identity scoped to the system temp
 *   dir. `false` leaves `GIT_CONFIG_GLOBAL` pointed at an empty file: any commit under the seal then
 *   has no identity and git refuses it, on purpose.
 * @returns {{ home: string, agentsHome: string, env: object, cleanup: () => void }}
 */
export function makeTempHome({ files = {}, gitIdentity = true } = {}) {
  const raw = fs.mkdtempSync(path.join(os.tmpdir(), "sealed-home-"));
  // realpath now: the includeIf glob below is matched against a realpath, and a mismatch here
  // (e.g. a symlinked temp dir) would silently widen or narrow which repos get the fixture identity.
  const home = fs.realpathSync(raw);
  const agentsHome = path.join(home, ".agents");
  fs.mkdirSync(agentsHome, { recursive: true });

  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(home, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  const gitConfigGlobal = path.join(home, ".gitconfig");

  if (gitIdentity) {
    const fixtureConfig = path.join(home, ".gitconfig-fixture");
    const tempRoot = fs.realpathSync(os.tmpdir());
    fs.writeFileSync(
      gitConfigGlobal,
      `[includeIf "gitdir/i:${toGitPath(tempRoot)}/**"]\n\tpath = ${toGitPath(fixtureConfig)}\n`,
    );
    fs.writeFileSync(
      fixtureConfig,
      "[user]\n\tname = Fixture\n\temail = fixture@example.invalid\n",
    );
  } else {
    fs.writeFileSync(gitConfigGlobal, "");
  }

  const env = {
    ...childEnv(home),
    AGENTS_HOME: agentsHome,
    GIT_CONFIG_GLOBAL: gitConfigGlobal,
    GIT_CONFIG_NOSYSTEM: "1",
  };

  function cleanup() {
    try {
      fs.rmSync(raw, { recursive: true, force: true });
    } catch {
      // best-effort only; a leftover temp dir under the system temp root is harmless
    }
  }

  return { home, agentsHome, env, cleanup };
}

/**
 * The RT-18 canary, callable both in-process (by a test) and from a spawned child (by
 * `scripts/run-tests.mjs`, which runs it inside the sealed environment before trusting it with the
 * suite). Self-contained: it derives the expected home from `AGENTS_HOME` itself (`<home>/.agents`)
 * rather than trusting a second, separately-passed value, so the check is "does this process's own
 * view of its home agree with itself" - exactly the thing that breaks when a seal leaks.
 *
 * @returns {{ ok: boolean, message: string }}
 */
export function checkSeal() {
  const agentsHome = process.env.AGENTS_HOME;
  if (!agentsHome) return { ok: false, message: "AGENTS_HOME is not set" };
  const expectedHome = path.dirname(agentsHome);
  const actualHome = os.homedir();
  if (path.resolve(actualHome) !== path.resolve(expectedHome)) {
    return {
      ok: false,
      message: `os.homedir() = ${actualHome}, expected ${expectedHome} (derived from AGENTS_HOME = ${agentsHome})`,
    };
  }
  if (path.resolve(agentsHome) !== path.resolve(path.join(actualHome, ".agents"))) {
    return { ok: false, message: `AGENTS_HOME = ${agentsHome} is not "<home>/.agents" for home ${actualHome}` };
  }
  return { ok: true, message: "sealed" };
}
