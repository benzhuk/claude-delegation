// scripts/test-home.mjs
//
// The ONE way a test (or `scripts/run-tests.mjs`) builds a sealed fake home: a fresh, disposable
// temp directory that stands in for HOME (and USERPROFILE, since `os.homedir()` reads that on
// Windows), with AGENTS_HOME pointed underneath it, and - when asked - a git identity that ONLY
// resolves for repos created under `fixtureRoot` (a dedicated `<home>/fixtures` directory), never
// for a real repo and never for anything else merely sitting under the system temp dir. That
// scoping is the point (C5, narrowed by L-C7): a commit inside a fixture repo under `fixtureRoot`
// gets an identity; a commit attempted anywhere else under the seal - including elsewhere under
// the system temp dir - has none and fails loudly, so the seal (which hides `core.hooksPath` and
// every other global git setting, via GIT_CONFIG_GLOBAL + GIT_CONFIG_NOSYSTEM) never becomes a way
// to bypass the machine's real git-identity guard for a real repo. Narrowing the scope from the
// whole system temp dir to `fixtureRoot` matters because the system temp dir is shared with every
// other process on the machine, sealed or not - a stray repo built there by something else could
// otherwise pick up the fixture identity by accident.
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
 * IMPORTANT for callers who then create a fixture repo to commit into (T1, T3, L-C7): the
 * `includeIf "gitdir/i:..."` pattern this seeds only matches a gitdir that is itself under the
 * REALPATH of `fixtureRoot`, the `env.FIXTURE_ROOT` this function returns - NOT the whole system
 * temp dir. Build every fixture repo with `fs.mkdtempSync(path.join(fixtureRoot, <prefix>))` -
 * never inside this repo, a project scratch path, elsewhere under `os.tmpdir()`, or any other
 * location - or the commit you make in it gets no identity and git refuses it. The pattern and the
 * `path =` value are always written with forward slashes, even on Windows (a backslash in a git
 * config value is an escape sequence and silently mis-resolves) - `toGitPath` below is the one
 * place that conversion happens; a caller does not need to repeat it.
 *
 * @param {object} [opts]
 * @param {Record<string,string>} [opts.files]  relative-path -> content, written under the new home
 *   before `env`/`cleanup` are handed back (e.g. seeding `.agents/...` state for a test). Written
 *   BEFORE `.gitconfig`/`.gitconfig-fixture` are seeded, so a `files` entry at either of those paths
 *   is silently overwritten by the identity seeding below - don't pass one.
 * @param {boolean} [opts.gitIdentity=true]  seed the fixture git identity scoped to `fixtureRoot`.
 *   `false` leaves `GIT_CONFIG_GLOBAL` pointed at an empty file: any commit under the seal then
 *   has no identity and git refuses it, on purpose.
 * @returns {{ home: string, agentsHome: string, env: object, fixtureRoot: string, cleanup: () => void }}
 */
export function makeTempHome({ files = {}, gitIdentity = true } = {}) {
  const raw = fs.mkdtempSync(path.join(os.tmpdir(), "sealed-home-"));
  // realpath now: the includeIf glob below is matched against a realpath, and a mismatch here
  // (e.g. a symlinked temp dir) would silently widen or narrow which repos get the fixture identity.
  const home = fs.realpathSync(raw);
  const agentsHome = path.join(home, ".agents");
  fs.mkdirSync(agentsHome, { recursive: true });

  // L-C7: fixture repos live under their OWN dedicated directory inside the sealed home, not
  // anywhere under the whole system temp dir - the includeIf pattern below is scoped to exactly
  // this. realpath it too, for the same reason `home` above is realpath'd: the glob is matched
  // against a realpath, and `fixtureRoot` being a plain child of an already-realpath'd `home`
  // does not itself guarantee no symlink was introduced by `mkdirSync` on every platform.
  fs.mkdirSync(path.join(home, "fixtures"), { recursive: true });
  const fixtureRoot = fs.realpathSync(path.join(home, "fixtures"));

  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(home, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  const gitConfigGlobal = path.join(home, ".gitconfig");

  if (gitIdentity) {
    const fixtureConfig = path.join(home, ".gitconfig-fixture");
    fs.writeFileSync(
      gitConfigGlobal,
      `[includeIf "gitdir/i:${toGitPath(fixtureRoot)}/**"]\n\tpath = ${toGitPath(fixtureConfig)}\n`,
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
    APPDATA: path.join(home, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(home, "AppData", "Local"),
    XDG_CONFIG_HOME: path.join(home, ".config"),
    HOMEDRIVE: home.slice(0, 2),
    HOMEPATH: home.slice(2),
    GIT_CONFIG_GLOBAL: gitConfigGlobal,
    GIT_CONFIG_NOSYSTEM: "1",
    FIXTURE_ROOT: toGitPath(fixtureRoot),
  };
  // Removed rather than blanked: some callers branch on the KEY BEING ABSENT, not on its value
  // being empty (e.g. codex-hook-trust.mjs falls back to process.env.CODEX_HOME only when the
  // passed-in env has no such key at all) - an empty string would still count as "present".
  for (const k of ["CODEX_HOME", "CLAUDE_CONFIG_DIR", "ORCA_CODEX_HOME", "ORCA_USER_DATA_PATH",
    "ORCA_TERMINAL_HANDLE", "ORCA_PANE_KEY", "ORCA_TAB_ID", "ORCA_WORKTREE_ID", "NOTE_SLUG"]) delete env[k];

  function cleanup() {
    try {
      fs.rmSync(raw, { recursive: true, force: true });
    } catch {
      // best-effort only; a leftover temp dir under the system temp root is harmless
    }
  }

  return { home, agentsHome, env, fixtureRoot, cleanup };
}

/**
 * The RT-18 canary, callable both in-process (by a test) and from a spawned child (by
 * `scripts/run-tests.mjs`, which runs it inside the sealed environment before trusting it with the
 * suite). Checks two independent things, both required: (1) internal self-consistency - `AGENTS_HOME`
 * agrees with `os.homedir()` the way `<home>/.agents` should - and (2) that the home itself is
 * actually sealed, i.e. `os.homedir()` resolves to a fresh directory somewhere under the realpath'd
 * system temp dir, never the real profile. (1) alone is not enough: an UNSEALED child with
 * `USERPROFILE=<real home>` and `AGENTS_HOME=<real home>/.agents` is perfectly self-consistent and
 * would pass (1) while running the suite against Ben's real machine - the exact failure this canary
 * exists to catch.
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
  const tempRoot = fs.realpathSync(os.tmpdir());
  const rel = path.relative(tempRoot, path.resolve(actualHome));
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, message: `os.homedir() = ${actualHome} is not a fresh dir inside ${tempRoot} - not a sealed home` };
  }
  return { ok: true, message: "sealed" };
}
