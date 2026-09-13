# Spec: `multi` peer-note protocol, universal tier table, shared skills (2026-09-12)

Decisions made by Ben on 2026-09-12 (multiple choice, recorded verbatim in intent):

## D1. Transport
Type the note into the recipient's pane with `orca terminal send --terminal <handle> --text "<note>" --enter`
(plain PTY typing — Claude Code queues typed input mid-turn: "Press up to edit queued messages").
NEVER use `orca orchestration dispatch/send/worker-*` for peer notes. A sender script checks the
recipient pane's agent state first (`orca terminal list --json` / read): if a permission prompt is
open, DEFER and retry (never type into a permission dialog); if the pane is missing, report BLOCKED
delivery to the sender — a note must never be dropped silently. Codex pane queuing is unverified:
the pilot must test it and the skill must say what to do if Codex does not queue (fallback: append to
the ledger + retry when idle).

## D2. Where notes live
Per-repo, committed: `docs/notes/<id>.md` for detail packets, `docs/ledger/YYYY-MM-DD.md` for the
one-line-per-event ledger (every session appends the same envelope line it sent or received).
Cross-repo notes go to the RECIPIENT's repo (the one who must act); the sender's own ledger gets a
one-line pointer. Files are written immediately and committed with the session's next normal commit
(no per-note commits, no daily sweep).

## D3. Kinds and acks
Kinds: ASK, ACK, RESULT, BLOCKED, FYI. Exactly one ACK when a peer starts on an ASK, one RESULT when
done (with path), BLOCKED once with the reason then move on, FYI needs nothing. No heartbeats, no
worker_done, no role framing ("you are a worker" is banned). Corrections name the id they supersede.
Paid/irreversible actions need explicit authorization AND acknowledgment of current conditions;
elapsed time is never approval. No secrets in notes.

## D4. Envelope (one line, ≤ ~2 lines of substance)
`<from> → <to>, M.D.YY HH:MM <TZ> [<id>] <KIND>: <ask/answer ≤2 lines>. Goal: <why>. Details: <path>. Needs: <decision|review|ack|none> by <time>`
- id = short slug + counter, e.g. `pr132-review-1`; replies reuse the slug with `re:` or the next counter; a re-sent note with the same id is a no-op for the reader (dedup).
- Times in Ben's local zone (America/New_York today; rule 05-time.md), numeric M.D.YY dates, zone stated. Full grammar: skills/multi/references/envelope.md (pinned).
- Event time may be stated separately from send time when they differ.

## D5. Naming / scope
New skill `multi` = talk to an EQUAL session you do not own (peer notes). Existing `delegate` = fan
out subordinate work you own. `team-build` unchanged in role. Both Claude and Codex load `multi`.

## D6. Tier table (single source of truth, replaces every "call Opus"/"Sonnet writes")
| tier | job                          | Claude | OpenAI (Codex)            |
|------|------------------------------|--------|---------------------------|
| top  | orchestrate, judge, decide   | Fable  | GPT-6-Astra               |
| high | verify, adjudicate, hardest  | Opus   | GPT-5.6-Sol               |
| mid  | default executor             | Sonnet | GPT-5.6-Terra             |
| fast | bulk sweeps only             | Haiku  | GPT-5.6-Luna, GPT-5.3-Codex-Spark |
Sentence pattern in skills: "run this on a high-tier model (Claude Opus / GPT-5.6-Sol)". Every tier
mention names the tier AND both vendors in parentheses. Env var `CLAUDE_DELEGATION_TOP_TIER` →
vendor-neutral `DELEGATION_TOP_TIER` holding a mixed list (`fable,opus,gpt-6-astra,gpt-5.6-sol`);
the delegation-reminder hook default becomes vendor-neutral. rules/30-delegation.md gate "only when
running model is Fable" → "only when running a top- or high-tier model" with both vendors' ids.

## D7. Shared skill location
Canonical authored location for shared skills: `~/.agents/skills/<name>` (Codex scans it natively).
Claude Code reads `~/.claude/skills/<name>`: on macOS/Linux a symlink, on Windows a sync script
(junction/symlink needs admin or dev mode) — provide ONE setup script that does the right thing per
OS and is idempotent; document it in the skill install notes and the dotfiles (chezmoi) repo.
Order of sharing: `multi` (new), `delegate` + `team-build` + `docs/model-tiers.md` (after tier
rewrite), `knowledge` + `triage` (also fold `~/.codex/memories/*` into the one knowledge store),
`dev-server`. Claude-only mechanics stay Claude-only (Agent tool, subagent_type, hooks.json,
AskUserQuestion) but are named as such; Codex gets parallel agent role files
(`~/.codex/agents/{builder,reviewer,integrator}.toml`) with models from the tier table.

## D8. Rollout
Team-build now. Pilot with the `astra` (Codex) and `taxonomy` (Claude) sessions on Netcup for one day
starting 2026-09-13; then `multi` becomes the default (an AGENTS.md/CLAUDE.md line: "peer messages:
use the multi skill; never orca orchestration dispatch"). Orca's own `orchestration` skill stays
installed for Orca's task/worker features, not for peer chat. No Orca fork change in this round.

## Research inputs (read-only references for builders)
- Orca internals: `.claude/agent-reports/74ca276f-70e5-4b77-9678-3d4720d95d0f/orca-orchestration-internals.md`
  (preamble text `preamble.ts:62-65`; messages = mailbox + one-line pointer typed only into IDLE panes;
  `agent_prompt_blocked` = recipient at a permission prompt, `agent-prompt-submission-verification.ts:140`,
  `orca-runtime.ts:22099`; 16 MB terminal input cap).
- History numbers: `.../netcup-orchestration-history.md` (43/90 heartbeats, 62% status unread, 14% dispatches failed silently).
- Universality audit + Codex facts: `.../skills-universality-audit.md` (Codex skill paths, frontmatter, models_cache tiers, subagent config).
- Session feedback (Netcup): `~/orch-feedback-astra.md`, `~/orch-feedback-n-astra.md`, `~/orch-feedback-taxonomy.md`
  (envelope, ledger, receipts-not-heartbeats, never a hidden drop, event vs send time).

## Pinned contracts (committed at t0, frozen for builders)
- `skills/multi/references/envelope.md` — envelope grammar, regex, ledger/notes paths, transport rules.
- `skills/multi/scripts/note-send.mjs` — CLI interface, behaviour order, exit codes (body to be implemented by T1).
- `docs/model-tiers.md` — the 4-tier table, sentence pattern, `DELEGATION_TOP_TIER` env var (prose to be expanded by T2).

## Territory map (one owner per path; no edits outside your territory)
| Territory | Repo | Owns | Deliverable |
|---|---|---|---|
| T1 `multi-skill` | claude-delegation (branch `feat/multi-protocol`) | `skills/multi/SKILL.md`, `skills/multi/scripts/note-send.mjs` (implement), `skills/multi/scripts/note-send.test.mjs`, `skills/multi/references/examples.md` (envelope.md is frozen), `scripts/mirror-shared-skills.mjs`, `codex/agents/{builder,reviewer,integrator}.toml`, `codex/README.md` | The `multi` skill (peers, not workers; Claude+Codex wording), a working cross-platform sender with tests, the mirror script that publishes `skills/*` to `~/.agents/skills/<name>` (symlink on macOS/Linux, copy on Windows, idempotent) and codex agent files to `~/.codex/agents/` |
| T2 `tier-rewrite` | claude-delegation (same branch) | `docs/model-tiers.md` (expand; table frozen), `skills/delegate/SKILL.md`, `skills/team-build/SKILL.md`, `docs/agent-pacing.md`, `docs/concurrency-budget.md`, `docs/mandate-standards.md`, `docs/subagent-contract.md`, `hooks/delegation-reminder.js`, `hooks/hooks.json`, `agents/*.md`, `README.md`, `.claude-plugin/plugin.json` | Every bare model name replaced by the tier pattern; env var renamed with fallback; README gains a `multi` section and the tier table; version 0.2.0 |
| T3 `dotfiles` | `~/.local/share/chezmoi` (branch `feat/universal-skills`; NEVER run `chezmoi apply`) | `dot_claude/rules/30-delegation.md`, `dot_claude/rules/20-tools.md`, `dot_claude/skills/{knowledge,learn,triage}/SKILL.md`, new `dot_codex/AGENTS.md`, new `run_onchange_after_mirror-shared-skills.sh.tmpl` (macOS/Linux) + Windows equivalent per chezmoi conventions already in the repo, `dot_claude/knowledge/_inbox/<date>-codex-memories-merged.md` (content of `~/.codex/memories/*.md`), `docs/2026-09-12-universal-skills.md` | Rules gate on tiers not vendors; "peer messages: use the multi skill, never orca orchestration dispatch" line in the rules and in the global Codex AGENTS.md; knowledge skills speak of `CLAUDE.md`/`AGENTS.md` and one shared store; the mirror runs on apply |
| Integrator | — | runs T1 tests, `node --check` on every .mjs/.js touched, a `--dry-run` and a real FYI note to the `notes` pane on Netcup | pass/fail report |

Out of scope this round: any Orca fork change; touching `~/.claude/skills/orchestration` (Orca's own); per-note git commits; a hook-based delivery path.
Git rules for every builder: commit on the named branch with the machine's configured identity only — never `-c user.*`, `--author`, `GIT_AUTHOR_*`, `--no-verify`. Conventional commit messages. Do not push.

## Red-team adjudication (2026-09-13) — binding on all territories
Report: `C:\Users\benzh\Code\Zhuk Projects\.claude\agent-reports\74ca276f-70e5-4b77-9678-3d4720d95d0f\redteam-multi-spec.md`.
Accepted and folded into the v2 contracts (envelope.md, note-send.mjs header, model-tiers.md): C1 two-phase send +
state re-read + never-send-on-unknown; C2 classifyPane from `terminal show` (`agentIdentity`, `agentWait`) + read tail;
C3 authority clause; H1 one physical line ≤500 chars; H2/H3 Details path format + regex without trailing period;
H4 ids prefixed by sender; H5 recipient always appends, grep dedup; H6 main checkout + `~/.agents/notes` mirror;
H7 `merge=union`; H8 cross-host rule + exit 5; H9 ambiguity → exit 2, `--to` accepts handles, pilot panes renamed to
slugs; H10 reserved `ben`; H11 precedence line (T3) + NOT-clauses in `multi`/`delegate`/`team-build` descriptions
(T1/T2); M1 Codex recipients idle-only until the pilot proves queuing; M2 hibernated = do not send; M3 kind/needs
enforced; M4 lowercase ids; M5 `supersedes` in brackets + packet field; M6 shell panes never typed into; M7 execFile
argv, no shell strings; M8 Astra-for-review note in the tier table (table rows unchanged — Ben's decision); M9 T3 also
owns `dot_claude/rules/00-machine.md`; M10 T2 also owns `.claude-plugin/marketplace.json`; M11 the mirror publishes
ONLY to `~/.agents/skills/` and `~/.codex/agents/` (Claude keeps getting plugin skills from the plugin cache; sources
are the plugin `skills/*` plus the chezmoi-managed `~/.claude/skills/{knowledge,triage,dev-server,learn}`);
M13/M14 receipt rules verbatim in SKILL.md; L2 `GPT-5.3-Codex-Spark`; L4 NOT-clause in delegate/team-build; L5 packet
"Received / acted" section.

## Added territory: Integrator + orchestrator (install, pilot, rollback)
Owner: orchestrator (Ben's session) with the integrator's smoke report. Deliverables: run the mirror on Windows,
Netcup, Hetzner, Mac (`~/.agents/skills/multi`, codex agent files); create `docs/ledger/`, `docs/notes/`, the
`merge=union` line in `.gitattributes`, and the one-line rule in CLAUDE.md/AGENTS.md of the two pilot repos
(bto-workflows, bto_nucleus); rename pilot panes to slugs; a documented rollback (remove the mirror, drop the rule
line). Pilot exit criteria (2026-09-13 → 09-14): ≥10 notes delivered, 0 silent drops, 0 permission-prompt approvals
attributable to a note, "does Codex queue typed input mid-turn?" answered yes/no in writing with evidence.

## Orchestrator rulings on T1's contract flags (2026-09-13, binding for the T1 fix round)
1. envelope.md example: trailing period removed (was a contract typo; the regex text was right).
2. Cross-host notes (replaces H8's `<host>:<abs path>` form, which cannot express a Windows path): a note to a
   pane on ANOTHER host is sent by running note-send ON THE RECIPIENT'S HOST over ssh
   (`ssh ben@100.69.249.18 note-send --from <sender-slug> --to <pane> … --packet-file -` with the packet body on
   stdin, or `--packet-file <path on that host>`). The packet and ledger therefore always land in the recipient's
   repo; `Details:` stays repo-relative. note-send gains `--packet-file <path|->` (writes the packet to
   `<repo>/docs/notes/<id>.md` before the ledger line; refuses to overwrite an existing packet unless `--force`).
   Exit 5 remains for "`--recipient-repo` given while the resolved pane's `executionHostId` is not the local
   runtime". The `<host>:` Details prefix is dropped from the grammar. envelope.md and the note-send header are
   updated by the orchestrator after the T1 review; T1 implements in its fix round.
3. Uppercase ids: reject with the lowercase suggestion (frozen wording stands).
4. Quotes in substance: allowed (execFile argv); backticks and `$(` stay rejected. Header stands.
5. `merge=union` for `docs/ledger/*.md`: pilot repos only, installed by the orchestrator at pilot setup.
6. Sender host identity: `ORCA_SENDER_HOST` env, else `local`. With ruling 2 the value only matters for exit 5.
7. File length: `note-send.mjs` is split in the fix round into `envelope.mjs` (grammar, validation, parse) +
   `note-send.mjs` (I/O, transport); both under `skills/multi/scripts/`, tests updated, interface unchanged.
8. Test command: the README/SKILL docs use the glob form `node --test "skills/multi/scripts/*.test.mjs"`.
