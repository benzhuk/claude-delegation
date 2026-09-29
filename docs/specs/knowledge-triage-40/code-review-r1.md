VERDICT: NEEDS_FIXES (10) 42e356b3714202cc187a2fa6baa44e859b8c14a8

# Lane40 independent code review r1

Reviewed: `42e356b3714202cc187a2fa6baa44e859b8c14a8`. Scope: `scripts/knowledge-gather.mjs`, `scripts/knowledge-triage.mjs`, the Lane40 diff of `scripts/install-janitor-timer.mjs` and `scripts/knowledge-counts.mjs`, and their four test files, checked against rev4, spec-r1-adjudication, contracts.d.ts, test-seam-ruling, spec-review-r4 and probe-r3/r4.

Integration evidence: `focused-r2.log` shows 104 tests, 101 pass, 0 fail, 3 skipped. I did not rerun the gate. The reviewed worktree is unmodified (`git status` is clean). I made no live SSH, notes, task, peer-message or config writes.

## Measured receipts (scratch only, under %TEMP%, fixtures only, not live proof)

- `lane40-review-terminal-XURzQJ`: `runKnowledgeTriage` with one seeded pending netcup origin and a changed same-name remote version. The receipt has `terminal` = two identical `{netcup, 2026-08-01-n.md, superseded}` entries, while the netcup row reports `terminal: 1` (finding 3). `lane40-review-terminal-0BKdls` is an earlier attempt of the same fixture. It failed on my own fixture argv (node rejected `-T`), not on the code under review, so ignore it.
- `lane40-review-precond-Alkvgp`: a skill with no writer paragraph gives `{status:"attention", verified:false, exitCode:1, notes:1}`. Those are exactly the four assertions the repaired changed-DIGEST test makes (finding 5).
- On this Windows writer host (`Ben-Desktop`), `runProcess({cmd:["note-send"]})` returns `error: ENOENT`, and so does `npm`. `assertFieldSafe("text", recoveryText(...))` from `skills/multi/scripts/envelope.mjs` refuses the text: "--text contains a newline or tab; an envelope is exactly one physical line" (finding 1).

## Findings

### 1. HIGH: the required BLOCKED to Ben can never be delivered in production, and the failure is silent
- **Cause:** `knowledge-triage.mjs:75-80` spawns the bare `note-send` with `shell:false`. On Windows that name exists only as an extensionless sh script and a `.cmd` (`~/.local/bin/note-send{,.cmd}`), so libuv spawn fails with ENOENT (measured). Even with the spawn fixed, `recoveryText` (`:65-73`) joins lines with `\n`, and note-send's envelope validator refuses any newline in `--text` (measured). `runProcess` never rejects, and `defaultNoteSend` ignores `{error, code}`, so the `catch` at `:89` never even fires. No receipt field, reason or ATTENTION text records that delivery failed. All six ATTENTION paths (lock held twice, stale run.lock, timeout, out-of-selection, publication, skill deferred twice) are affected. The tests inject `noteSend: async (t) => notes.push(t)`, which accepts anything, so the production path is never exercised.
- **Failure case:** the curated lock is held on two runs, so ATTENTION is written and later runs skip, but Ben gets no BLOCKED line. The stall is visible only to someone who opens `~/.agents/knowledge-triage/`.
- **Fix location:** `scripts/knowledge-triage.mjs` `defaultNoteSend` / `raiseAttention` and their callers.
- **Patch** (replace `:75-90`):
```js
async function defaultNoteSend(ctx, text) {
  const r = await runProcess({
    cmd: [process.execPath, path.resolve(HERE, "..", "skills", "multi", "scripts", "note-send.mjs")],
    args: ["--from", "knowledge-triage", "--to", "ben", "--kind", "BLOCKED", "--topic", "knowledge-triage", "--text", text, "--sender-repo", path.resolve(HERE, "..")],
    env: process.env, timeoutMs: 30_000,
  });
  if (r.error || r.code !== 0) throw new Error(r.error ? String(r.error.code ?? r.error.message) : `note-send exit ${r.code}: ${r.stderr.trim().slice(0, 160)}`);
}

/** Write ATTENTION and post exactly one BLOCKED to Ben; returns "" or a visible delivery-failure suffix. */
async function raiseAttention(ctx, reason) {
  const text = recoveryText(reason);
  const line = text.replace(/\s*\n\s*/g, " | ").slice(0, 450);
  let delivery = "";
  try {
    if (ctx.deps.noteSend) await ctx.deps.noteSend(`BLOCKED knowledge-triage: ${line}`);
    else await defaultNoteSend(ctx, `knowledge-triage: ${line}`);
  } catch (err) { delivery = `; BLOCKED to Ben NOT delivered (${err && err.message ? err.message : err})`; }
  try { fs.mkdirSync(ctx.stateDir, { recursive: true }); fs.writeFileSync(ctx.attention, `${ctx.now().toISOString()}\n${text}\n${delivery ? `${delivery.slice(2)}\n` : ""}`); } catch { /* receipt still records it */ }
  return delivery;
}
```
  Then, at each of the six call sites, change `await raiseAttention(ctx, why); return done("attention", why, 1);` to `const sent = await raiseAttention(ctx, why); return done("attention", why + sent, 1);`. The same applies to the literal-reason sites at `:231-232`, `:349-350` and `:358-359`. **Predicted outcome:** the existing tests still pass (`/rmdir ~\/\.claude.../` still matches the single line, and `/skill deferred/` still matches). A delivery failure becomes visible in both `receipt.reason` and ATTENTION.
- **Discriminating check:** a test with no `deps.noteSend` whose fake `note-send.mjs` path (or a `noteSend` that runs `assertFieldSafe("text", t)` and throws) makes `receipt.reason` match `/BLOCKED to Ben NOT delivered/`. On the current code the reason carries no such text. A second assertion runs the real `assertFieldSafe` on the text passed to `noteSend` and must not throw.
- **Simplification:** reuse note-send.mjs through `process.execPath`. No PATH or PATHEXT resolution is needed, and no new mechanism.

### 2. MEDIUM: remote archive unlinks the source before verifying the linked inode's hash
- **Cause:** `knowledge-gather.mjs:48-53`. The hash is checked on `src` at `:48`. `ln "$src" "$dst"` at `:51` then links whatever inode `src` names at that moment, and `rm -f -- "$src"` at `:52` runs on `-ef` alone. `okdst` (the hash check) runs only after the unlink at `:53`. Suppose a writer atomically replaces the source name (rename-over) between `:48` and `:51`. The new version is hard-linked into `_archive/<month>/<name>`, its only inbox name is removed, and the answer is `POSTCHECK_MISMATCH`. On the next run `src` is absent and `dst` does not match `h`, so the answer is `ORIGIN_MISSING`, a terminal outcome with no further action. The untriaged new version is stranded in the remote archive, which gather never reads (top-level only). The note is not byte-lost, but it is lost as knowledge and never gets a decision. The 5-minute `-mmin +5` filter narrows but does not close this window.
- **Patch** (replace line `:52`, keep `:53` as is):
```
'  if ! [ "$src" -ef "$dst" ]; then echo POSTCHECK_MISMATCH; exit 0; fi',
'  if ! okdst; then rm -f -- "$dst"; echo CHANGED_SOURCE; exit 0; fi',
'  rm -f -- "$src"',
```
- **Predicted outcome:** in the race above, `dst` is the same inode as the new `src` and fails `okdst`. The extra link is removed, the answer is `CHANGED_SOURCE` (unresolved "origin changed since gather"), and the new version stays in the inbox. The next gather imports it and supersedes the old version. The normal path is unchanged.
- **Remaining window:** a microsecond window remains between `-ef` and `rm`. Closing it fully needs a rename claim: `mv` `src` to a unique same-directory temp, hash it, `ln` to `dst`, then `rm` the temp. That is optional.
- **Discriminating check:** a fake-SSH fixture whose shell wraps `ln` so that it first replaces `src` with different bytes. Today it ends with `src` absent and `dst` holding the new bytes. After the fix, `src` holds the new bytes and the answer is `CHANGED_SOURCE`.
- **Fix location:** `ARCHIVE_SCRIPT`.

### 3. MEDIUM: superseded terminal outcomes are reported twice in the run receipt
- **Cause:** `knowledge-triage.mjs:287` copies `gathered.residue.terminal`. `reconcileKnowledge` then appends to that same residue object (`knowledge-gather.mjs:502`) and returns it as `hosts.residue`, and `:370` pushes every entry again, gather-phase entries included. This contradicts adjudication F7, "Report each once". It was measured: two entries against a row count of 1. The gather tests check only host rows, so they miss it.
- **Patch:** `:370` `for (const t of rec.terminal ?? []) terminal.push(t);` becomes `for (const t of rec.terminal ?? []) if (!terminal.includes(t)) terminal.push(t);`. The entries are the same object references, so this works.
- **Predicted outcome:** the fixture gives one entry. An origin-missing entry added during reconcile is still appended once.
- **Discriminating check:** the fixture above, asserting `receipt.terminal.length === 1`.

### 4. MEDIUM: an unknown managed set is treated as "nothing managed"
- **Cause:** `knowledge-gather.mjs:315-318`. If `chezmoi source-path` fails (timeout, missing binary, target not yet managed), `managedSet` returns an empty set and no error. Gather then imports remote managed names (`:443`), and `selectNotes` (`knowledge-triage.mjs:183`) offers local managed notes to the skill. This is the F1 hazard: the skill archives a source-managed note, the next `chezmoi apply` resurrects it, and a duplicate decision follows. The runner still spawns the nested run, because the baseline `publicationState` failure does not gate the spawn. Only the post-run publication check raises ATTENTION, after the damage is done.
- **Fix:** return `{set, error}` from `managedSet`. In `runKnowledgeTriage`, resolve the managed set before `gatherKnowledge`. On error, `return skip(\`managed set unresolved: ${error}\`)`, with no gather and no spawn. Pass the resolved set into `gatherKnowledge` (an extra option field) so chezmoi is not asked twice.
- **Discriminating check:** a `chezmoiCommand` fixture that exits 2, no `chezmoiSourceInbox`, and a local note whose name is in the source inbox. Today the note is selected and Claude is spawned. After the fix, the run is skipped with the named reason and the claude log is empty.
- **Fix location:** `knowledge-gather.mjs` `managedSet` and `managedNames`; `knowledge-triage.mjs:268-275`.

### 5. MEDIUM (tests): repaired publication tests can still pass on an unrelated precondition failure
- **Cause:** at `knowledge-triage.test.mjs:320-334`, `changed DIGEST cannot report success…` asserts only `status==='attention'`, `publication.verified===false`, `exitCode!==0` and `notes.length===1`. The writer-missing precondition gives exactly that tuple (measured). This is the false-positive class focused-r1 found, and it is still undetected if a fixture regresses. Separately, the `unchanged` mode does not reach the "no commit touching DIGEST" branch. HEAD stays `1…1` while the fake remote says `2…2`, so it passes through the remote-mismatch branch and duplicates the `remote-mismatch` mode. `no-change remote mismatch…` (`:336-346`) likewise passes on any non-attention skip, for example `claude CLI missing`. The success test (`:300-318`) checks `sessions.length >= 1` but never that the recorded id equals the argv `--session-id`.
- **Patch**, in the changed-DIGEST loop:
```js
    if (mode === 'unchanged') { h.configure({ action: 'archive', advanceHead: false }); h.configureGit({ remoteHead: '1'.repeat(40), touchesDigest: false }); }
    else h.configure({ action: 'archive' });
```
  and after `const result = …`:
```js
    assert.equal(result.receipt.nestedExitCode, 0, mode);
    assert.match(result.receipt.reason, mode === 'remote-mismatch' ? /^publication not verified: HEAD does not match/ : /^publication not verified: DIGEST changed but no commit/, mode);
```
  In the no-change test, add `assert.equal(result.receipt.nestedExitCode, 0); assert.equal(result.receipt.reason, 'skill deferred'); assert.match(result.receipt.publication.reason, /remote ref/);`. In the success test, add `const argv = JSON.parse(fs.readFileSync(h.claudeLog,'utf8').trim().split('\n')[0]).argv; assert.ok(sessions.includes(argv[argv.indexOf('--session-id') + 1]));`.
- **Predicted outcome:** all pass on the current source. Deleting `digestCommitSince` from the problem expression now fails `unchanged` and `unrelated` separately, and breaking the writer fixture fails on the `reason` assertion.
- **Fix location:** `scripts/knowledge-triage.test.mjs`.

### 6. LOW-MEDIUM: `run.lock` liveness is PID-only, so after a crash PID reuse hides a permanent stall
- **Cause:** `knowledge-triage.mjs:248-249` considers only `isAlive(owner.pid)`. If a run is killed (power loss, or the Task Scheduler PT2H kill of node), `run.lock` remains. Windows reuses PIDs aggressively. If an unrelated long-lived process holds that PID, every daily run returns `skipped: job already running` with exit 0, with no escalation and no ATTENTION. That is an indefinitely hidden stall, contrary to F4's "stale or unverifiable ownership yields attention".
- **Patch** (replace `:249`):
```js
      const ownerAgeMs = owner ? ctx.now().getTime() - Date.parse(owner.started) : NaN;
      if (owner && Number.isInteger(owner.pid) && isAlive(owner.pid) && ownerAgeMs >= 0 && ownerAgeMs < 3 * 60 * 60 * 1000) return skip("job already running");
```
  3 hours is longer than the PT2H task limit.
- **Predicted outcome:** the concurrent-run test still skips (its fixed clock gives age 0). A lock older than 3 hours with a live PID becomes ATTENTION with no auto-removal.
- **Discriminating check:** seed `run.lock/owner.json` with `pid: process.pid` and `started` 4 hours before `now`. Today the result is `skipped`; it must be `attention`.

### 7. LOW: reconcile zeroes the gather-phase `unresolved` host count
- **Cause:** `knowledge-gather.mjs:504` resets `unresolved: 0`, so an import-name collision counted at `:470` disappears from `receipt.hosts[].unresolved` while `receipt.residue.unresolved` still lists it. The receipt's counts disagree with its names.
- **Patch:** `:504` `const rows = gathered.hosts.map((r) => ({ ...r, archived: 0, unresolved: 0, resurrected: r.resurrected }));` becomes `const rows = gathered.hosts.map((r) => ({ ...r, archived: 0 }));`.
- **Discriminating check:** local inbox pre-seeded with different bytes at the deterministic import name, then a run. The row's `unresolved` must be 1.

### 8. LOW: the first skill deferral is labelled `status: "success"`
- **Cause:** `knowledge-triage.mjs:354-372` returns `done("success", "skill deferred", 0)`. F4 says a deferral "is `skill deferred`, not successful processing". A receipt consumer that keys on `status` sees success for a run that processed nothing.
- **Patch:** `:372` `return done("success", reason, 0);` becomes `return done(reason === "skill deferred" ? "skipped" : "success", reason, 0);`. Reconciliation still runs before it; `lastEndedAt` stays at the previous processing run, which fits `notesArrived`.
- **Judgment note:** if root prefers `success` + reason, record that as the explicit contract instead.

### 9. LOW: the watchdog can signal twice
- **Cause:** `knowledge-gather.mjs:101` kills the tree on overflow. The timeout handler at `:109-110` kills it again unconditionally if `close` has not arrived (for example, an escaped descendant holds the pipe). On Windows the second `taskkill /PID <pid> /T /F` can hit a reused PID.
- **Patch:** `:110` `timedOut = true; killTree(child.pid);` becomes `timedOut = true; if (!overflow) killTree(child.pid);`.

### 10. LOW: one remote filename containing a backslash fails the whole host every run
- **Cause:** `knowledge-gather.mjs:289` treats `\` (a legal POSIX filename byte) like a path separator and throws, so the host's entire gather fails (`invalid tar stream`) and all of that host's notes stall. The failure is visible, but it can only be fixed by hand on the remote.
- **Patch** (replace `:289-291`):
```js
    if (name === "" || name.startsWith("/") || name.includes("/") || name === "..") {
      throw new Error(`unsafe tar entry path ${JSON.stringify(name)}`);
    }
    if (/[\\]/.test(name) || /^[A-Za-z]:/.test(name)) { unsupported.push(name); continue; }
```
- **Predicted outcome:** the name becomes `unsupportedName` residue, and the rest of the host still imports. Traversal and absolute paths still fail the host.
- **Check first:** confirm that no hostile-name test expects a host failure specifically for a backslash. If one does, the owner decides which behaviour is intended.

## Verified absences (first-class)
- **Publication identity.** Per-note eligibility needs `pub.verified` (fresh `ls-remote` equal to HEAD on a named branch; a detached HEAD is refused) plus the literal `· <slug> →` in `git show HEAD:<source-path>` (`knowledge-gather.mjs:334-374`, `:514-518`). A changed DIGEST also requires a commit touching the source path since `dotfilesBefore` (`knowledge-triage.mjs:344-352`). HEAD movement alone never passes (the `unrelated` mode discriminates). A no-change mismatch sets `verified=false` and moves nothing (`:514`). Changed-DIGEST failures become ATTENTION. A missing slug becomes `digest entry missing` residue.
- **Nested failures.** Timeout, nonzero exit and out-of-selection return before publication and reconcile.
- **Import.** A dot-temp is written, fsync'd, then exclusively hard-linked, and the owned temp is unlinked. There is no partial-write fallback. Hash-equal existing files are `same`; different bytes are a conflict. A deterministic name plus the `findArchived` check prevents re-triage even if `state.json` is lost. Status-frontmatter mutation is handled by name and month, never by comparing archive bytes.
- **Tar.** Checksum, octal-only fields, pax length/newline validation, rejected linkpath/size disagreement/non-regular types/traversal/absolute/drive paths, dot and AppleDouble skipped, 1 MiB oversize residue, 1000 entries, 64 MiB stream, end marker required. Everything is validated in memory before any write. The remote programs are constants; data travels only on stdin, validated in sh (`BADNAME`/`BADARG`); there is no interpolation.
- **SSH.** Fixed `-T BatchMode StrictHostKeyChecking=yes ConnectTimeout ForwardAgent=no ForwardX11=no ClearAllForwardings PermitLocalCommand=no RemoteCommand=none RequestTTY=no`. The environment is an allowlist (no API keys, tokens or Git identity). Commands go host-to-local only; nothing moves remote to remote. The Mac `pending` endpoint and `null` endpoints spawn nothing.
- **Seams.** `sshCommand`, `claudeCommand`, `gitCommand`, `chezmoiCommand`, `nestedTimeoutMs`, `hostTimeoutMs`, `timers` and `endpoints` are reachable only through `options.deps`. The CLI accepts only `--manual` (`knowledge-triage.mjs:394-405`). Defaults are `ssh`/`claude`/`git`/`chezmoi`, 60 min and 60 s. `claude.exe`, `ssh.exe`, `git.exe` and `chezmoi.exe` all resolve as real executables on this host.
- **Nested environment.** `ANTHROPIC_*`, `ORCA_*` (including `ORCA_TERMINAL_HANDLE`, the multi hook's identity), peer/session/`NOTE_`/Git identity and `*_API_KEY`/`_TOKEN`/`_SECRET` are stripped, except `CLAUDE_CODE_OAUTH*` for plan auth. `SSH_AUTH_SOCK` is removed. `--setting-sources user` keeps user guards. There is no permission bypass flag.
- **Sessions and counts.** `sessions.json` is written before spawn with the same UUID passed as `--session-id`. `knowledge-counts` excludes on the last token, which is the hook's `session_id` (`hooks/knowledge-log.mjs:218`).
- **Tokens.** Usage comes only from the `result` event. It is `{unavailable}` when absent, and total is the sum of the four categories.
- **Curated lock.** It is checked before gather and before spawn, and never taken or cleared. `run.lock` is released only when its token matches.
- **Real watchdog test.** It uses the real clock (elapsed between 150 ms and 10 s) and asserts the grandchild is dead.
- **Selection.** Oldest-first across the whole union with a filename tie-break, cap 60. Original age is kept through `sourceMtimeMs`/`originalName`. The exact SLUG_SENTENCE matches F3 byte for byte.
- **Installer.** Triage only: three-entry marker table, writer check before any write (exit 2), Windows-only, InteractiveToken, `Enabled=false`, PT2H, StartBoundary from `--first-run` or today. `--enable` runs Create, Query, `Change /ENABLE`, Run. Other jobs' generator paths are unchanged. `--first-run` is refused for other jobs. The log is overwritten each run, so it stays bounded.
- **Not in this code (checked):** the skill/README amendment and the lock-recipe delivery are absent. Both are separate dependencies with their own receipts, as the brief requires.

## Not proven here (fixture versus live)
Everything above is fixture behaviour. Real Git/chezmoi publication, the real Netcup/Hetzner `find -mmin`/`tar --format=pax`/`sha256sum`/`-ef`, Windows ssh.exe under the minimal environment, whether the production nested argv (no `Bash(git:*)` restriction) lets the skill publish, and Task Scheduler behaviour all remain for the live gate.

## JUDGMENT
**Not yet.** Finding 1 means any ATTENTION raised during the live proof or afterwards is never delivered to Ben, a hidden failure. Finding 3 duplicates terminal outcomes in the receipt that would be quoted. Finding 4 fails open to managed-note triage (duplicate decisions) whenever chezmoi resolution fails. Finding 2 is a narrow but real knowledge-loss ordering.

After fixes 1-4, plus the finding-5 test hardening so those fixes are guarded, the implementation shows no data-loss, overwrite, permission-bypass or false-archive-success path for one supervised run under the genuine writer home. The run must stay manual and single; confirm `chezmoi source-path` for DIGEST resolves beforehand. Findings 6-10 can follow before unattended scheduling.

Cause: the listed defects stem from unchecked child-process results (the notification), check-after-act ordering (remote archive), a shared mutable residue object copied then re-appended (terminal), and fail-open handling of an unresolved dependency (the managed set).
Discriminating check: each finding names one; measured receipts exist for 1 (ENOENT and validator refusal), 3 (two terminal entries against a row count of 1) and 5 (the precondition failure satisfies all four assertions).
Fix location: `scripts/knowledge-triage.mjs` (`defaultNoteSend`/`raiseAttention`, `:249`, `:370`, `:372`), `scripts/knowledge-gather.mjs` (`ARCHIVE_SCRIPT` `:52`, `managedSet`, `:110`, `:289`, `:504`), `scripts/knowledge-triage.test.mjs` (`:300-346`).
Simplification: calling note-send.mjs through `process.execPath` removes any need for PATH/PATHEXT resolution. Passing the resolved managed set into gather removes the duplicate chezmoi call (`managedSet` today runs in both `gatherKnowledge` and `managedNames`). No mechanism needs adding.
