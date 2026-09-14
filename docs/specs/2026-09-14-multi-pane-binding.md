# Spec: durable pane↔slug binding + 1-minute flush (multi 0.3.2), 2026-09-14

## Incident (Netcup, 2026-09-14 16:10–16:45 NYC)
`note-flush` logged `no-pane [taxonomy-main-tip-8] -> astra — no pane titled "astra"` every 2 minutes for 35
minutes. `orca terminal list` showed the two Codex panes as `n-astra | bto_nucleus` (the old astra process, pane
renamed by Ben) and `Continue | bto-workflows` (the astra Ben restarted after the account switch). Codex derives
a pane's title from the conversation (`Continue`, `switch-to-astra-model`, `switch-to-sol-model` all appear in
`flush.log` as "slugs"), so title == slug is only true right after Ben renames the pane, and every restart
breaks it. astra runs `note-inbox --me astra --ack` at the start of every turn (its cursor proves it), so the
agent itself knows its slug — the transport just never remembers which HANDLE said so. Result: astra finishes a
turn, idles waiting for a reply that is already in the ledger, and nothing wakes it.

## Design
D1. **Binding file** `~/.agents/notes/panes.json`: `{ "<handle>": { "slug", "at", "title" } }` — an explicit
    "this pane IS <slug>" record, distinct from the title-derived cache `.pane-slug.json` (which stays as the
    fallback for notify). Written atomically (tmp + rename), one file, both keys posix.
D2. **Registration** — `note-inbox --me <slug>` (any mode) with `$ORCA_TERMINAL_HANDLE` set writes/refreshes
    `panes.json[handle] = {slug, at: now, title?}`. Also `note-notify --to <slug>` when the handle is known. A
    new subcommand `note-inbox --bind <slug>` does only the registration (for Ben / a hook), prints the binding.
    If the handle is currently bound to a DIFFERENT slug, the new call wins (the agent in the pane is the
    authority on who it is) and the change is appended to `flush.log` as `rebind <handle> <old> -> <new>`.
D3. **Resolution order** in `resolvePane(terminals, to, {bindings})` (used by note-send, note-flush, note-notify):
    1. `to` is a handle → exact handle (unchanged).
    2. exact title match (unchanged, `titleMatchesSlug`).
    3. otherwise the bindings whose handle is in `terminals` and whose slug === to; exactly one → return it and
       report `via: 'binding'` (the flush.log line says `typed into <handle> (binding, title "Continue | …")`).
       If ≥2 live bound handles carry the slug → exit 2 ambiguity WITH the list, as today (red-team H9).
    4. still nothing → exit 2 `no pane titled "<slug>" and no bound pane` + `describePanes`, plus the hint
       `run: note-inbox --bind <slug> inside that pane`.
    A title match beats a binding when they disagree (a freshly renamed pane is the newest intent); when both
    point to the same handle nothing changes. Dead handles (not in `terminals`) are ignored, never deleted here.
D4. **notify path** (`note-notify` resolving "which pane am I"): `--to` > `$NOTE_SLUG` > `panes.json[handle]` >
    `.pane-slug.json[handle]` (cached title) > live title. The `(cached)` title cache must NOT overwrite a
    binding. Log `slug=<slug>(binding)`.
D5. **Ambiguity in `note-inbox`** with no `--me`: if `panes.json` binds the current handle, use it before the
    title (currently a pane titled `Continue` gets slug `continue` and reads an empty inbox forever).
D6. **GC**: `note-flush` drops bindings whose handle is absent from `terminals` for > 24h (by `at`), logs `gc`.
D7. **Flush every minute** (dotfiles repo, chezmoi source `C:\Users\benzh\.local\share\chezmoi`):
    `dot_config/systemd/user/note-flush.timer` `OnUnitActiveSec=1min`; `run_onchange_after_note-flush-task.ps1.tmpl`
    `-RepetitionInterval (New-TimeSpan -Minutes 1)`; `Library/LaunchAgents/com.benzhuk.note-flush.plist`
    `StartInterval` 60; fix the comment in `run_onchange_after_note-flush-timer.sh.tmpl` (says 120s). The
    flusher must stay idempotent under overlap (it already uses a lock — verify; if not, add a lockfile with a
    stale threshold of 5 min).
D8. **Docs**: SKILL.md "If you are a Codex session" gains one sentence: running `note-inbox --me <slug>` also
    binds your pane, so the title no longer has to equal your slug (still rename it — humans read titles);
    exit-code table row 2 mentions `--bind`. `references/envelope.md` untouched. Bump plugin to 0.3.2
    (`.claude-plugin/plugin.json` + marketplace json if present) and CHANGELOG if present.

## Contracts (pinned)
- `readBindings(home, fs) -> Record<handle,{slug,at,title?}>`; `writeBinding(home, handle, slug, {title, fs, now})`;
  `bindingsPath(home) = <notesDir>/panes.json`. All in `transport.mjs`, exported, pure except fs.
- `resolvePane(terminals, to, opts = {})` keeps its signature; `opts.bindings` optional. Return value gains
  a non-enumerable-free plain field `via: 'handle'|'title'|'binding'` ONLY if callers do not spread/compare the
  object as a whole — check call sites; otherwise return `{ pane, via }` from a NEW `resolvePaneWithSource` and
  leave `resolvePane` as a wrapper returning `pane`.
- Tests (`*.test.mjs`, node:test, in-memory fs like the existing suites): binding registration, resolution
  precedence (title > binding), ambiguity, dead-handle skip, notify precedence, GC, --bind subcommand.
  All 231 existing tests stay green: `node --test skills/multi/scripts/`.

## Territories
| T1 `binding` | claude-delegation (branch `feat/pane-binding` from main 4e9e42e) | `skills/multi/scripts/{transport,note-inbox,note-notify,note-flush}.mjs` + their tests, `skills/multi/SKILL.md`, plugin version files |
| T2 `timers`  | chezmoi source repo (main), separate commit | the four timer files in D7 only |
Both: configured git identity only (never -c user.*, --author, GIT_AUTHOR_*, --no-verify); conventional
commits; LF line endings (`.gitattributes` enforces; never write CRLF); JS `String.replace` with a string
replacement expands `$&`/`$1` — use a function replacement whenever the replacement text comes from data; ESM
main-module guards must compare realpaths (symlinked installs). Do not push; the orchestrator publishes and
deploys (`mirror-shared-skills.mjs` on each machine).
