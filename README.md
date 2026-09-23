# claude-delegation

Multi-agent orchestration for [Claude Code](https://code.claude.com) and Codex,
distilled from real large-scale sessions (up to ~40 subagents per session) — including
the incidents: the load-average-452 fan-out stampede, the hours-long fix round nobody
had put a timer on, the agents whose final reply was `Done.` while their report said
`NEEDS_FIXES`. Tiers are vendor-neutral (Claude and OpenAI/Codex both mapped, see
below); the subordinate-fan-out skills below are for work you spawn and own — talking to
an equal peer session is the separate `multi` skill.

## Install

```
/plugin marketplace add benzhuk/claude-delegation
/plugin install delegation@benzhuk
```

Or non-interactively:

```bash
claude plugin marketplace add benzhuk/claude-delegation
claude plugin install delegation@benzhuk
```

> **One prerequisite for peer notes (multi 0.5.0).** Each machine's Claude user settings
> (`~/.claude/settings.json`) need `"crossSessionInbound": "accept"`. Peer notes are delivered into a
> session's own inbox socket; without that setting a session which bypasses permission prompts HOLDS an
> arriving note behind a modal approval dialog in its pane instead of delivering it, which is worse than
> not delivering at all — and the sender cannot tell, because a held post looks delivered on the wire.
> `mirror-shared-skills.mjs` warns when it is missing and never edits settings itself.


## What you get

**Seven skills** (auto-suggested by task shape, or invoke directly):

- **`/delegation:delegate`** — parallel fan-out orchestration for independent
  research / review / audit lanes: decompose, tier the models, budget the concurrency,
  write full mandates, set timers, consume reports.
- **`/delegation:team-build`** — spec-driven builder/reviewer pipeline for substantial
  multi-file features: pinned contracts committed at t0, disjoint file territories,
  adversarial high-tier reviews with attack briefs, one integrator owning the expensive
  verification verbs, ship gate with the orchestrator.
- **`/delegation:multi`** — peer-session notes: one-line envelopes to an EQUAL session
  you don't own (see below).
- **`/delegation:decisions`** — record a question only the owner can answer on their
  Notion decisions page and keep working, instead of blocking on a reply. An explicitly
  configured pickup host can call the one-shot registered-page pickup with the existing
  reader and note transport. It preserves immutable captures, binds a page to one host
  and authorization project, recovers uncertainty conservatively, and requires explicit
  owner accounting. It does not activate a scheduler, revive an owner, clear `Done`, or
  establish two-host behavior.
- **`/delegation:bearings`** — assess a goal from bounded evidence, choose `CONTINUE`,
  `RE-PLAN`, or `CUT`, then publish a dated assessment with linked repository evidence.
  Its callable per-project receipt helper reports whether a matching completed assessment
  is due or current. A completion receipt requires the lead's explicit attestation of the
  report, lead response, and published URL; it does not mechanically prove their content.
  Claude Code can show a bounded due/unknown notice at SessionStart and during an active
  session's existing periodic reminder route. That notice never starts an assessment;
  automatic daily triggering, idle execution, and unattended `Done` pickup are not
  included. Codex cadence, installed-host discovery/parity, mixed-host validation, and
  live Goals preservation/readback remain pending release gates.
- **`/delegation:continue`** — keep an ongoing authorized goal moving through a pause,
  wave closeout, or status turn: select useful ready work, preserve its evidence identity,
  refill genuinely free capacity, and use verified native host resume paths. It is guidance,
  not an unattended scheduler, automatic restart, or authority grant.
- **`/delegation:janitor`** — mechanical worktree/branch cleanup, report-only by
  default: a SAFE table (`--apply` acts on it, merged+clean+origin-confirmed only) and
  a JUDGMENT table for a human to decide, plus a read-only wiring-check section that
  flags a guard, hook, timer or switch that looks unwired on this machine.

Neither `delegate` nor `team-build` is for talking to a session you don't own — see
[`multi`](#multi--peer-sessions) below for that.

The plugin also ships `notion-writing` and `dev-server` as utility skills (`skills/`),
distinct from the seven orchestration skills above — mirrored the same way for Codex by
`mirror-shared-skills.mjs`. `notion-writing` keeps builder/owner work state in the
canonical Goals-page and Decisions documents, including the existing multiple-choice
decision-item template; it does not create a duplicate status page or automatic update.

The current goal is a provider-neutral harness for useful, verified work: Codex and
Claude Code are equal initial hosts, and mixed-agent collaboration remains a required
baseline. See [GOALS.md](docs/GOALS.md) for the active objective, measures, unknowns,
and acceptance boundary.

For work records, the source checker has a strict read-only acceptance mode: it resolves
the stated artifact and either a live delivery ref or an explicitly pinned artifact,
then requires an in-repository independent `VERDICT: APPROVE <sha>` for that exact
artifact. It refuses ambiguous revisions, malformed records, unreadable evidence, path
escapes, and a current matching refusal; it never changes its inputs. This proves local
review identity only, so it does not claim integration authority, installed behavior, or
goal satisfaction.

The portable `decisions` helper uses its canonical skill-local configuration when
mirrored, including an explicit `--goals` path. Configured and genuinely unconfigured
projects work from a copied layout; malformed, unreadable, or unknown configuration stays
BLIND and blocks an unsafe handback.

**Shared mechanics** (`docs/`, referenced by both skills — these links are repo-relative;
if you're reading a mirrored skill copy without `docs/` next to it, e.g. Codex's
`~/.agents/skills/{delegate,team-build}/SKILL.md`, find the same files at
`~/.claude/plugins/cache/benzhuk/delegation/<version>/docs/<name>.md` or
`github.com/benzhuk/claude-delegation/blob/main/docs/<name>.md`):

- [`model-tiers.md`](docs/model-tiers.md) — the tier table (below): mid tier writes,
  high tier verifies, fast tier sweeps, top tier orchestrates and judges; orchestrator
  tokens buy judgment only.
- [`subagent-contract.md`](docs/subagent-contract.md) — reports to disk with the
  verdict on line 1, the termination formula, notification idempotence, mid-edit death
  recovery.
- [`concurrency-budget.md`](docs/concurrency-budget.md) — budget the verbs, not the
  agents: read-only agents are free, expensive local verbs are a global mutex.
- [`agent-pacing.md`](docs/agent-pacing.md) — ETA at spawn, check-in at 1× ETA, and the
  slow-agent escalation ladder (levers, advisors, respawn, sunk-cost rule).
- [`mandate-standards.md`](docs/mandate-standards.md) — what every agent prompt
  carries: paths not summaries, the NOT-list, evidence formats, authorized negative
  results, budgeted autonomy grants.

**Three agents** for the team-build pipeline: `builder`, `reviewer`, `integrator`.

**Three hooks** (all require `node` on PATH):

- **Routing reminder** (UserPromptSubmit, SessionStart, PostToolBatch —
  `hooks/delegation-reminder.js`): injects a one-line routing reminder on every prompt —
  build → team-build, fan-out → delegate, small task → no agents — so the policy survives
  long sessions and context compaction. It reads `DELEGATION_TOP_TIER` (falling back to
  the legacy `CLAUDE_DELEGATION_TOP_TIER`; default `fable,opus,gpt-6-astra,gpt-5.6-sol`)
  to decide whether the current session is top/high-tier and add the orchestrator-economy
  sentence. It also injects the project's five-line goal card
  (`scripts/goal-card.mjs`, format in `templates/goal-card.md`) at session start
  (including after compaction) and once every 40 tool batches during a long autonomous
  stretch, never on every prompt; a subagent gets its goal from its mandate, not this
  hook. Off switches: `~/.agents/ws-off` (both features) and `~/.agents/ws-off-goalcard`
  (card only).
- **Peer-note inbox** (UserPromptSubmit, Stop, PostToolUse — new in 0.3.0): reads the
  peer-note ledger for this pane and injects anything new, so a `multi` note reaches the
  session without anyone typing into its pane. `Stop` blocks the stop while something is
  waiting (honouring `stop_hook_active`). Silent when there are no notes, when the
  session is not in an Orca pane, and on any error — a hook must never break a session.
- **Wiring check** (SessionStart — `scripts/wiring-check.mjs --line`): prints one line
  at session start when a required guard, hook, timer or switch looks missing or stale;
  silent when everything is wired, and honours `~/.agents/ws-off`.

## Model tiers

Every skill and doc here names a tier, never a bare model — see
[`model-tiers.md`](docs/model-tiers.md) for the full rationale and spawn mechanics per
vendor. The table (copied verbatim, single source of truth in that file):

| tier | job | Claude | OpenAI (Codex) |
|------|-----|--------|----------------|
| **top**  | orchestrate, judge, decide, synthesize — never bulk execution | Fable  | GPT-6-Astra |
| **high** | verify, adjudicate, spec red-team, the hardest territories (algorithms, concurrency, data integrity) | Opus | GPT-5.6-Sol (see note) |
| **mid**  | default executor — writes code, runs searches, mechanical edits, integration gates | Sonnet | GPT-5.6-Terra |
| **fast** | mindless bulk sweeps only | Haiku | GPT-5.6-Luna, GPT-5.3-Codex-Spark |

Note on the OpenAI high row: OpenAI ships one flagship, so a Codex REVIEW or
adjudication runs on GPT-6-Astra unless cost forbids (a genuinely stronger model than
the writer); GPT-5.6-Sol is the high-tier choice for hard BUILD territories instead.
Claude has two distinct models here (Fable above Opus), so its rows need no such
caveat. Full rationale: `model-tiers.md`.

Sentence pattern in every skill: "run this on a high-tier model (Claude Opus /
GPT-5.6-Sol)" on first mention in a file, "the high-tier reviewer" afterward.

## `multi` — peer sessions

`delegate` and `team-build` are for subordinate work you spawn and own. `multi` is the
separate skill for talking to an EQUAL session you do not own — asking, briefing, or
handing off to a peer pane, another territory's owner, or a session on another machine.
Both Claude and Codex load it. Never use Orca orchestration dispatch for this.

**The ledger is the channel; typing into a pane is a wake-up.** Every note is appended to
`docs/ledger/<today>.md` (and mirrored to `~/.agents/notes/`) before anyone tries to type
it anywhere, and the recipient discovers it by reading. A wake-up that cannot be typed —
the pane is mid-turn, at a permission prompt, unreadable — costs latency, never the note.
This is the 0.3.0 correction after a day-long two-session pilot in which no typed note
reached the Codex pane for five hours while senders sat blocked for up to an hour each.

Notes are one physical line, ≤700 characters, following a pinned envelope grammar (full
contract in `skills/multi/references/envelope.md`):

```
taxonomy → nucleus, 9.13.26 10:05 NYC [taxonomy-pr132-review-1] ASK: Please review my PR #132. Goal: faster wall clock, better batch orchestration. Details: docs/notes/taxonomy-pr132-review-1.md Needs: review by 15:00
```

Four commands, all on PATH after the mirror runs:

```bash
# send: ledger first, then a best-effort wake-up. Exit 3 means queued, not failed.
note-send --from taxonomy --to nucleus --kind ASK --topic pr132-review --text "Please review my PR #132." --goal "faster wall clock, better batch orchestration" --needs review --by "15:00"

# read: the ledger as this pane's inbox. Exit 0 always.
note-inbox --me taxonomy --ack

# retry the wake-ups that could not be typed. Runs itself; this is for looking.
note-flush --dry-run
```

`note-notify` is the fourth: Codex runs it from `~/.codex/config.toml` at every turn end —
the one moment a Codex pane is provably idle — and it drains that pane's queued wake-ups.

Receiving is automatic on both vendors:

| | how a note reaches the session |
|---|---|
| **Claude Code** | the plugin's `UserPromptSubmit`, `Stop` and `PostToolUse` hooks run `note-inbox`, inject the new notes, and ack. `Stop` blocks the stop when something is waiting. |
| **Codex** | `note-inbox --me <slug>` at the start of every turn (AGENTS.md), plus the `notify` drain above. Codex does not queue typed input mid-turn, so it is never typed at while working. |

## Install (mirror for Codex)

Codex reads shared skills and agent roles from its own paths, not the Claude Code plugin cache. Publish once after installing the plugin (idempotent; also supports `--dry-run`, `--force`, `--uninstall`):

```bash
node scripts/mirror-shared-skills.mjs
```

Publishes: skills to `~/.agents/skills/<name>`; the shared docs to `~/.agents/skills/_docs/` (so `../_docs/<name>.md` links resolve); Codex roles to `~/.codex/agents/*.toml` with models from the tier table above; and the four PATH shims `note-{send,inbox,flush,notify}` (plus a `.cmd` for each on Windows) — all recorded in `~/.agents/skills/.mirror-manifest.json`, so `--uninstall` removes exactly what it created.

## The philosophy, in four lines

1. Orchestrator tokens buy judgment (spec, adjudication, ship); executors run at full
   strength; verifiers are a tier above the writer.
2. Agent count is not the load-bearing variable; concurrent local processes are.
3. The reply is not the result — the report file is.
4. Nothing paces itself: every agent gets an ETA, every ETA gets a timer, every timer
   gets a decision.

## License

MIT

## Changelog
- 0.17.0 — adds callable, one-shot pickup for one registered decisions page through the
  existing reader and note transport. It persists immutable capture evidence, binds the
  page to one pickup host and authorization project, refuses uncertain resend/recovery,
  and requires explicit owner accounting before a later round. This is not scheduler
  activation, automatic owner revival or `Done` clearing, or two-host validation.
- 0.16.0 — adds a callable, per-project bearings receipt helper that reports due/current
  state and records an explicit completion attestation for the assessment report, lead
  response, and publication URL. Claude Code's existing SessionStart and active-session
  reminder path can surface a bounded due/unknown notice only; it does not run an
  assessment, schedule idle work, or establish completion. Codex cadence and
  installed-host parity remain unverified. The release also routes builder/owner state
  through the existing Goals-page and Decisions canonical pair, with no copied status
  policy or automatic Notion update.
- 0.15.0 — adds `continue` to the shared mirror inventory and release guidance. It keeps continuation finite, evidence-backed, and provider-neutral, with explicit native resume limits. This release also adds strict read-only acceptance checking for exact review identity and makes copied-layout decisions handback resolve its canonical local configuration, including explicit goals paths. Source checks do not establish installation, automatic cadence, unattended Done pickup, or host parity.
- 0.14.0 — adds `bearings`, a callable, evidence-bounded goal assessment that records a `CONTINUE`, `RE-PLAN`, or `CUT` decision with explicit unknowns and a dated, repository-linked publication. Its source/callable scope uses the `decisions` helper for an attended render; installed Claude/Codex discovery, mixed-host validation, and live Goals preservation/readback remain release gates. Automatic daily triggering and unattended `Done` pickup are not included.
- 0.13.0 — multi: a session is reachable by its own name, no launch flag required. `/rename <slug>` mid-session or `claude --name <slug>` at launch now writes the same sidecar the `SessionStart` hook reads FIRST, ahead of `NOTE_SLUG` and any `panes.json` binding, so a pane named after it was already running registers its inbox at the very next hook event instead of staying invisible until restarted with the env var set. And on 2026-09-22, on the Mac, a checkout left on an old branch ran `mirror-shared-skills.mjs`'s 0.5.0 build and its drop loop unlinked four already-mirrored 0.12.0 entries it no longer recognized as its own, because the manifest recorded no plugin version at all. The manifest now stamps `pluginVersion` and `sourcePath` on every write, and a mirror run refuses to drop or overwrite a newer-versioned target from an older source tree unless `--allow-downgrade` is passed.
- 0.5.0 — multi: delivery goes to your peer's INBOX, not your peer's keyboard. On 2026-09-17 the flusher typed a peer note into the middle of a sentence Ben was writing and submitted it; `classifyPane` judges idleness from the transcript and can say nothing about whether the input box is empty. Every session now registers its own inbox from the hook that already runs in it — Claude Code's per-session messaging socket, Codex's on-disk queue — in `~/.agents/notes/inboxes.json` (mode 600; the socket entry holds a per-session token, which is key material and is never logged, printed or returned). note-flush posts there: no orca call, no keystroke, and a composer somebody is using stays exactly as they left it. A recipient with no registered inbox leaves its entry queued with one `no-inbox` line and no attempt counted — the note is in the ledger, which is the channel. Typing survives only as an explicit last resort behind `MULTI_ALLOW_TYPING=1`, with `~/.agents/notes/no-type` still a hard off switch on top of it; the pane classification, `panes.json` and the two-phase send stay in the tree and stay tested, and a later version removes them once inbox delivery has run for a while. Two prerequisites, both verified live: the receiving Claude session needs `crossSessionInbound: "accept"` (without it a bypass-permissions session HOLDS the message behind a modal dialog), and a Codex thread needs one persisted turn before its queue accepts anything. And no, Orca has no non-keystroke wake path at all — every route into a running pane ends in a PTY write, and `orchestration.send` is a mailbox the recipient must poll, so do not propose it again.
- 0.4.2 — codex hooks: one canonical trust key. A Windows `config.toml` could end up with the same trust entry under three spellings — Orca's literal `'C:\Users\…'`, 0.4.0's forward slashes, and 0.4.1's escaped `"C:\\Users\\…"` — and since TOML unescapes the first and third to the same key, every Codex home on the box stopped parsing ("Cannot declare … twice"). The installer now writes one spelling (the path as Codex spells it, as a TOML literal string), matches existing headers logically across both quote styles and, on Windows, across separator and case, collapses duplicates of its own keys with a `dedupe` line, and validates the result before writing — a file that would still declare a table twice is REFUSED and left untouched. The prune reads headers the same way, so a leftover written in any spelling is recognised.
- 0.4.1 — multi: no parking. The Stop hook no longer long-polls while an ASK is outstanding — it surfaces the notes already in the ledger and exits, because a peer that answered under a new id left one session parked 15 minutes at the end of every turn for a day. Hooks deliver during a turn; an idle pane is nudged by the flusher within a minute. The `.listening-<slug>.json` marker is gone and any left behind are swept by note-flush; Stop's handler timeout is 60 s again, and the Codex installer prunes the trust entries the old timeout left.
- 0.4.0 — multi: hook delivery for BOTH agents. Codex gets hooks (SessionStart/UserPromptSubmit/PostToolUse/Stop), installed and pre-trusted into every Codex home by the mirror; both agents share one hook core; every delivery carries a one-line `systemMessage` for the human, never a keystroke in the composer; a Stop hook long-polls up to 15 minutes, but only while that session has an ASK outstanding, and the flusher leaves a listening pane alone.
- 0.3.2 — multi: durable pane↔slug bindings (`~/.agents/notes/panes.json`). A pane that runs `note-inbox --me <slug>` (or the new `note-inbox --bind <slug>`) is reachable by slug however its title changes afterwards; a title that contradicts a pane's own binding loses to it, and a binding for a handle that has been gone over 24 h is dropped on the next flush that has work to do.
- 0.3.1 — flusher: composer/history split, zero-tolerance completion (never submits foreign text), per-call budgets ≥10 s / per-note ≥30 s, dead-letter + ben-inbox line on give-up.
