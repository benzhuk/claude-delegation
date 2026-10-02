---
name: decisions
description: Use when something only the owner can decide comes up, when writing or reading the owner's decisions page, or when choosing between blocking on a question and recording it and moving on. NOT for peer asks between equal sessions — that is multi.
---

# Decisions — record it, keep moving

## The one idea

A session never blocks on the owner. It records the decision on the owner's decisions
page, keeps working on whatever else is dispatchable, and picks the answer up later
(not checked).

## Writing an item

Shape: `templates/decision-item.md`, read with `scripts/decisions-read.mjs` (both
live in this skill's own folder, so the path is the same read from a checkout or a
mirrored copy). Every item goes in through the template shape. A bullet that is not a
`<details>` toggle with unticked options and a Default or No default line is not a
decision: the reader cannot see it (not checked — a bullet with no options is
invisible to `scripts/decisions-read.mjs`, rule 5, so nothing reports it; only a toggle
that has options but neither line is caught, as a WARN, rule 10a).

One toggle per decision, a unique title, one or two lines of evidence, two to four
unticked options with the recommended one FIRST marked "(recommended)" (not checked).
Last plain line: `Default after <date> <time> <±UTC offset>: <option>` for a
reversible decision — use the offset in force on that date (`-04:00` New York in
summer, `-05:00` in winter), e.g. `Default after 2030-06-15 18:00 -04:00: cap at 200
items per run` — or `No default: <reason>` for anything irreversible, costly, or
that changes the owner's machines (checked by `scripts/decisions-read.mjs`, rule 10a).
Inside the item, no agent line starts with bold — some agent-written bold comes back
from Notion escaped exactly like an owner comment (not checked). Bold stays only in
the `<summary>` title (not checked).

In chat, give the link and the item title only. Never restate the options or the
recommendation in chat; a decision that exists only in chat is invisible to the
reader (not checked).

## Page rules

`scripts/decisions-read.mjs` reads a comment from a line starting with the escaped
`\*\*` Notion produces from the owner's typed asterisks — plain agent bold
(`**like this**`) is never one (checked by `scripts/decisions-read.mjs`). The
decisions-page renderer refuses, before publishing, a bare filename ending in .md,
.sh, .io, .ai, .co, .me, .so or .py, a bare `~`, or an unwrapped `www.`/`http(s)://`
span that Notion would otherwise autolink on the way back, with no exemption for a
quoted owner line (Lane 32, checked by `scripts/decisions-render.test.mjs`). Never
re-type or quote the owner's line when answering it: a copied `\*\*` prefix forges a
second comment that never clears (not checked). Write and read the page through the
`notion-writing` skill: markdown endpoints only, one request per page, never a
whole-page replace, read fresh seconds before writing, a multi-line edit built from a
script with the old and new text loaded from files, not argv (not checked). On the
goals page, write only with anchored edits, `notion.js edit
--safe` — never `publish` or `replace-md`; render Goals with `goals-mirror.mjs render`,
then use a fresh read and targeted edits of agent-owned sections. Exit 3 or exit 4 from that edit stops the
pass: reread the page fresh, do not retry the same edit blind (checked by
`skill-text.test.mjs` that this rule is written down; the stop itself is not checked
by any script).

The decisions page is different (Lane 26, `pack/spec.md`): it is a render of
`docs/decisions/**`, never edited in place, so it can never drift back into an append
log. `replace-md`, `replace-range`, `append-md`, `publish` and every hand or anchored
edit are banned there for every agent — `scripts/decisions-render.mjs` (the renderer)
excepted — because that script is the ONLY way the page is ever written. Write it only
by running `node <skill-dir>/scripts/decisions-render.mjs publish --repo . --page
<decisions-page-id> --reader ~/.claude/scripts/notion.js` (add `--clear-done --owner <your-session-name>` when the
fresh read shows owner input, per "Reading answers" below). `publish` runs from any
clean checkout on branch main of the registered repository; `--clear-done` finds the
pickup round only from the registered checkout or one of its linked worktrees (`git
worktree add`), never from a separate clone (Lane 34, pickup-binding).

When the record on origin says accepted, its Opus verdicts are in its evidence, and the
sealed suite is green on a second host from origin (a Windows host when built on Linux, a
Linux host when built on Windows — the lane lead runs it through ssh as a prior lane did,
or asks the spec lead, with that second-host gate log already written into the record's
evidence before `accept` ran (committed with the accepted record), since any record
change after `accept` needs a fresh check; not checked by any script), the lane lead
merges its branch into main with a merge commit that also appends ONE plain bullet —
never starting with bold — to `docs/decisions/history/<today>.md`:
`Merged <branch> at <sha>, <M-D>: <one-line changelog>; suite <n> of <n> on <host>.` —
pushes; then runs `node <skill-dir>/scripts/decisions-render.mjs publish --repo . --page
<decisions-page-id> --reader ~/.claude/scripts/notion.js` (Lane 26), and only then
sends its RESULT. No Waiting item is
posted for an ordinary accepted merge. Any other conflict when merging into main, of any kind,
means no merge: post a decision item under Waiting (template shape, with options) naming
the conflicting paths instead. An append-only conflict on the day file is resolved by
keeping both bullets in commit order; it is not a decision item. When
`origin/main` is not an ancestor of the branch tip, the merge result is a new tree: run
the sealed suite on the merge commit (at least the lead's own host, no new failing test
name vs main) before pushing main. Releases and installs to the owner's machines stay per
the owner's own word: the release item keeps the ordinary decision shape from "Writing an
item" above, its evidence made of the merged changelog lines rather than the merge
itself.

Two publishers never race: `decisions-render.mjs publish` reads the page fresh at
step 3 and refuses with exit 4 when the live page has drifted from
`docs/decisions/last-render.md` — a normalised diff against a stale base never lands.
If that fresh read shows Done checked and `--clear-done` was not passed, it refuses at
step 2 instead; the merge bullet goes verbatim into the RESULT and a later `publish`
picks it up. Its own last step commits and pushes `last-render.md`, so git is the lock:
a publisher who loses that race gets a normal git push rejection, fetches main, and
publishes again — nothing here reads or writes the Notion page by hand to resolve a
race. Before any of that (right after the fresh read, ahead of every check and write),
`publish` also refuses with exit 7 when `docs/decisions/` itself is dirty — a modified,
staged or untracked file other than `last-render.md` — naming the files and pointing at
`git restore`; commit and push them first, or restore them, then rerun (Lane 28,
render-guard).

The page callout's owner instruction is composed by `decisions-render.mjs render` itself
(the callout icon and text are the renderer's, never hand-typed): "To comment, start a
line with `**` anywhere on this page, then tick Done to submit; the answer appears here
and the exchange is kept in that day's history file." (the callout's position, the second to last block
inside the Waiting toggle, right before Done, is checked by `decisions-render.test.mjs`; its exact
wording is not — a future change to `COMMENT_CALLOUT` in `decisions-render-core.mjs`
would leave this quote stale again)

New items are files, not page edits: write one under `docs/decisions/waiting/` (template
shape, `templates/decision-item.md`) and `decisions-render.mjs render`/`publish` composes
it above the page-level Done control itself — there is no way to append past Done any
more (Lane 26). A checked `Done` means the owner has submitted choices/comments for
accounting; it grants no authority by itself. Account those inputs, reconcile a changed
fresh read if necessary, then run `decisions-render.mjs publish --clear-done --owner <your-session-name>`, which
writes `- [ ] Done (last cleared: <America/New_York timestamp>)` itself — no one hand-writes
that line. An unchecked Done is valid with zero or open decisions; an absent Done line
blocks the hand-back. In a registered pickup round, clearing Done and accounting the round
are ONE step (Lane 64): `publish --clear-done` accounts the round itself, after every check
has passed and before it writes the page, so no path clears Done and leaves the round
unaccounted (any page edit while that round's Done is still checked moves its receipt to
NEEDS_RECONCILIATION — the Done-window rules under "Reading answers"). Pass `--owner
<your-session-name>` (required when the step accounts the round): the attestation the step
records is that lead's, not the lead that first ran the pickup. If the page changed after the pickup last read it, the step refuses (exit 3); let one tick run and retry. In this one-step path the
history/verbatim check is the proof; the attestation records who ran it. If the round is stuck in
NEEDS_RECONCILIATION because the page changed after the note was recorded, `publish
--clear-done` closes it too when every owner input (the round's and the fresh page's) is
quoted in a committed `docs/decisions/history/` file on origin/main, any day, counted (an input text that appears N times must be quoted N times). The older
order still works: it also accepts an already-`ACCOUNTED` round whose Done is still checked
from that same round (the Done line unchanged since the capture, never cleared and
re-checked) and whose owner inputs still match (or, for a round accounted from NEEDS_RECONCILIATION,
whose fresh inputs add nothing or are all quoted in origin history) (checked by
`decisions-render-publish.test.mjs` and `decisions-pickup.test.mjs`).

The page is composed only of the toggles `decisions-render.mjs render` builds —
`Goal card`, `Bearings`, `Components`, `Waiting on you now` (which holds the items, `What is going on`,
`This session (since your tick at …)`, the comment callout and the Done checkbox) and `History` —
never a hand-added section (the shape and its reasons are under "Page shape" below); there is no `# Closed` section any more (a
closed item's record lives in `docs/decisions/history/<today>.md`, per "Closing" below).
Status narrative and logs live in the repo (`docs/work`, `docs/ledger`), not on this page
(not checked).

Every waiting item carries `Now: <one line> | To finish: <one line> | Est: <duration>` as one short line
directly under its title (at most 200 characters), and every session bullet that begins "In progress"
carries the same three fields inside its 200 characters; the renderer refuses a source file without
them, naming file and line (checked by `decisions-render-progress.test.mjs`).

Everything under Waiting is a decision item with options, including a request for
the owner to do something by hand: post it with a `Done by hand` option (never a bare
`Done`, which the reader takes for the page's Done), per the template's action-request
shape, and close it the turn its evidence lands. The reader warns on a `<details>` item
under Waiting with no options and on an item past its default date; a lead treats any
WARN from its post-write check as its own defect to fix in the same turn (checked by
`scripts/decisions-read.mjs`).

Existing extra sections are not deleted by this skill; whether to remove one is the
lead's call with the owner (not checked).

An optionless summary below the exact, top-level `# Closed` heading is historical rather
than a malformed active decision. Its owner comments and any checkbox options remain live
reader signals; archive scope never hides them. The scope ends at the next top-level level-one
(`#`) heading. An optionless summary under any other top-level section blocks both pickup and
hand-back.

`decisions-render.mjs publish` itself runs
`node <skill-dir>/scripts/decisions-title.mjs set --page <decisions-page-id>` as the last step
of its own pipeline (spec's step 7), right after the readback verifies, so the owner sees the
topic and the last-change time in the Notion toolbar without opening the page (not checked).
No agent calls `decisions-title.mjs` directly for the decisions page any more — this is
`publish`'s own step, not the pickup's: `decisions-pickup.mjs` never edits the page or clears
Done (above), so no call to `decisions-title.mjs` is added there either. Pass `--topic <Topic>` when neither
the page's registration nor its current title supplies one, to `publish` itself
(exit 2 names this). Exit 3 or exit 4 means the
title was not changed: `publish` itself fails at that step, before its final commit ever lands;
report it, and the hand-back check below will block on the stale title
(not checked).

## Reading answers

### One-shot pickup and owner accounting

An explicitly configured single pickup host may run one bounded read of the registered
decisions page and capture a checked Done with:

```
node <skill-dir>/scripts/decisions-pickup.mjs --once --page <id> --repo <project-root> --from <pickup-slug> --owner <owner-slug> --reader <notion-cli-path>
```

On one explicitly chosen pickup host, a private
`AGENTS_HOME/ws/decisions-pickup/registrations.json` may opt the existing standalone
`note-flush` timer into the same operation. Version 1 contains 1–16 exact
`{repo,page,from,owner,reader}` entries. Repositories and readers are absolute real
paths, pages are canonical 32-hex IDs, and each repo's `.agents/project.json` must bind
that page. The reader must be a regular non-symlink outside every Git checkout. Never
put provider credentials or page content in this file, commit it, discover projects or
owners automatically, or create it merely because the plugin is installed.

After an ordinary standalone flush finishes within the pickup admission window, one
validated entry is selected randomly and passed to the existing one-shot pickup. No
entry is guaranteed a particular minute. Imports, note-send/note-notify piggybacks,
targeted drains, `--home`, `--status`, and `--dry-run` never run registered pickup. The
current `flush-last.json` may contain a safe `pickup` code and selected ordinal; this is
diagnostic evidence only. `PICKUP_RECORDED` means the ASK for this round was recorded
and queued, possibly on an earlier pass. The next ordinary flush performs existing
inbox delivery; only explicit accounting proves the owner acted.

Registration identifies the current recipient but grants no authority. An existing
round keeps its saved owner: changing the registration produces manual handoff rather
than reassignment, and an unavailable owner remains visible through the existing
receipt/outbox. `AGENTS_HOME/ws-off` and `ws-off-decisions` disable registered pickup
before registration or page reads. Do not clear stale claims, resend `UNKNOWN`, migrate
legacy receipts, clear Done, or infer a new round outside the one-shot rules below.

This command invokes the reader itself; a saved export is only a test seam, not automatic
pickup. Existing `AGENTS_HOME/ws-off` or `ws-off-decisions` disables pickup before
page reads or writes; status and attended accounting remain available. It never edits
the page or clears Done. Exact immutable page bytes and parsed items are private under
`AGENTS_HOME/ws/decisions-pickup/captures`, outside every Git checkout. The durable
transport receives only a sanitized pointer Details packet under `AGENTS_HOME/notes/packets/<repo-name>/` (never in the checkout)
with hashes, local availability, and generic opening instructions. Inspect the receipt
with `decisions-pickup.mjs status --page <id> --repo <project-root>`. On the pickup host,
open an exact saved round only through the validating helper:

```
node <skill-dir>/scripts/decisions-pickup.mjs open --page <id> --repo <project-root> --round <n>
```

`PRIVATE_CAPTURE_UNAVAILABLE` means the exact submitted bytes are not on this host;
request an explicit manual handoff and never substitute a fresh page read. `PREPARED`
may resume its saved note ID once. `SENDING` resumes
only from positive matching transport evidence; `UNKNOWN` and `NEEDS_RECONCILIATION`
must not be resent. `RECORDED` means the peer note exists, not that the choices were
carried out. A stopped or replacement owner remains a visible pending manual handoff;
do not resurrect it or dispatch the same round again.

Version-1 receipts whose raw capture is already in a repository are reported as
`LEGACY_REPO_CAPTURE`. One-shot pickup refuses them without a page read, capture, move,
deletion, or send. Preserve the saved state and exact envelope history for manual
reconciliation; explicit accounting of an exact already-`RECORDED` legacy round remains
available.

The receipt and exclusive claim are global to the registered page on this one pickup
host. The first round binds that page to its authorization project. A second project or
worktree registration is `PENDING_MANUAL_HANDOFF`: it does not read, dispatch, or create
an independent round. Authorization project identity remains separate from the saved
durable transport repository; the project scope is part of every note ID and capture
name so old shared-mirror evidence cannot satisfy another scope. The page binding is
persisted as `CAPTURE_INTENT` before the first project-scoped capture write. A complete
capture resumes only that saved round; a missing capture may be recreated only from the
same unchanged checked bytes, while a partial, conflicting, or changed capture requires
manual reconciliation.

After a repo move, run `decisions-pickup.mjs rebind --page <id> --repo <new project root> --from-project <old path> [--owner <lead>]`
to move the receipt and its saved captures to the new project. It refuses while the old path
still exists, so a live project is never taken over; rounds opened after it use the new
project's scope, and the old round keeps its saved one.

A fresh, otherwise valid checked Done with zero captured selections or comments reports
`NO_ACTION`; it creates no round, receipt, private capture, pointer, or ASK. This admission
rule never replaces or erases an existing round.

After the attended owner has handled every captured `selection-NNN` and `comment-NNN`
reference and reconciled a fresh page read, write an outcome report containing
`Owner-attestation: <owner>`, a nonempty `Fresh-page-reconciliation: ...` line, and one
`Accounted-ref: <ref> ...` line for every capture reference. Then record that explicit
attestation with:

```
node <skill-dir>/scripts/decisions-pickup.mjs account --page <id> --repo <project-root> --outcome <existing-report-path> [--owner <your-session-name>]
```

`--owner` names the lead that runs the accounting; the report's `Owner-attestation:` line
must name that lead, and without `--owner` it must name the receipt's saved owner. The
receipt's own `owner` field is never rewritten (every saved capture is verified against it);
the accounting lead is recorded as `accountedBy`. A round stuck in NEEDS_RECONCILIATION by a
changed page is also accountable when every owner input in its original and reconciliation
captures is quoted in a committed `docs/decisions/history/` file on origin/main (any day), and
accounting settles a manual-handoff marker left by a differing registered owner. The normal
route for a pickup round is `publish --clear-done`, which accounts in the same step.

`account` does not mechanically prove the consequences and does not clear Done; `publish
--clear-done` is what clears it. A later round is
admitted only after this host has observed a valid unchecked page; an invisible same-byte
uncheck/recheck between reads cannot be detected. `UNKNOWN` has no automatic repair in
this first slice.

A lane lead's own merge bullet (the merge rule above) no longer touches the decisions
page at all, so it can never wedge a pickup round: the bullet goes straight into
`docs/decisions/history/<today>.md` in the merge commit, and the next `publish` (by
anyone, on any host, whenever it next runs) picks it up — carried or not, since nothing
but `publish` ever writes that page. The pickup round itself still holds three rules.
First, the owner lead's own first write in a pickup round clears Done
(`publish --clear-done --owner <your-session-name>`, which also accounts the round), after
the items from the saved capture (`open`) plus a fresh read are handled. Second, a lane lead whose own fresh read shows Done already
checked does not run `publish` itself: it carries whatever it would have posted verbatim
in its RESULT instead, for the owner lead to fold in once Done is next cleared. Third,
every round ends accounted — `publish --clear-done` does it, or `account` by hand — or a later Done tick wakes no one. The pickup host is
the host where the owner lead's inbox lives — `note-send` delivers only on the
recipient's own host, so registering pickup on the wrong host silently dead-letters the
wake (not checked).

`node ~/.claude/scripts/notion.js read <page-id> | node scripts/decisions-read.mjs`
(path per above; page id from `.agents/project.json`'s `decisions_url`, else from the
owner — never search, it's fuzzy). Exit 1: act, below. Exit 0: OPEN/REPLIED only —
nothing due. Exit 3: BLIND (empty read, bad fence, no titles) — stop, tell the owner,
change nothing (checked by `scripts/decisions-read.mjs`).

- AMBIGUOUS or UNATTACHED: report to the owner — never guess, never drop it
  (reported by `scripts/decisions-read.mjs`; UNATTACHED also blocks the hand-back via
  `scripts/decisions-handback.mjs`).
- TICKED: `scripts/decisions-read.mjs` reports the ticked option; act on it (not
  checked). An unhandled owner note on the same item still needs handling (next
  bullet) — a tick never cancels it (checked by `scripts/decisions-read.mjs`).
- On the decisions page specifically (Lane 26): `decisions-pickup.mjs` captures the
  owner's ticks and `\*\*` lines privately, without editing the live page. For each
  captured line, write the answer, with Ben's full text verbatim, into today's
  `docs/decisions/history/<today>.md` file (an instruction, or a question now closed) or
  into the relevant `docs/decisions/waiting/<slug>.md` item (a question on something
  still open there); then run `decisions-render.mjs publish --clear-done --owner <your-session-name>`, which
  refuses (exit 3) unless every captured line's text landed verbatim in one of those two
  places, and which composes the whole page fresh — so a handled owner note simply never
  reappears, nothing is deleted in place, and which accounts the round in the same step. The bulleted flow below
  (writing under `# Closed`, deleting the owner's line by anchored edit) describes the
  goals page only, unchanged.
- An owner note (a line starting with the escaped `\*\*`, on either the decisions page
  or the goals page) is one of two kinds, told apart by what the lead does, never by
  parsing the owner's text:
  - An instruction: do it, or record why not. Write one plain bullet under
    `# Closed` (on the decisions page, even for a note found on the goals page)
    beginning `Your note, <M-D>: "<first 12 words of the note>…" — <what was done>`
    (not checked), and delete the owner's line (checked by
    `scripts/decisions-handback.mjs`: a line left behind still reports COMMENTED or
    UNATTACHED and blocks). A note on an item that is still waiting also gets its
    answer inside that item, as a plain (not bold) line starting `Answered <M-D>:`,
    written before the owner's line is deleted (not checked).
  - A question: write `Reply: <YYYY-MM-DD> <answer>` directly under the owner's line
    — the numeric date is required, and this is what stops the next read reporting it
    again (inside a decision item; checked by `scripts/decisions-read.mjs`, REPLY_RE).
    Both lines stay until the first hand-back pass whose date is after the Reply
    date — flagged as an `ARCHIVE` line by `scripts/decisions-handback.mjs`
    (non-blocking) — at which point the pair is archived: one plain bullet under
    `# Closed` beginning `Your question, <M-D>: "<first 12 words>…" — <the answer>`,
    and both lines are deleted from the open section (not checked). If the answer is
    itself a decision, make it a template-shaped item and write the Reply as
    `Reply: <YYYY-MM-DD> made it an item above` (not checked). A follow-up from the
    owner under a reply is a new `\*\*` line and is COMMENTED again (checked by
    `scripts/decisions-read.mjs`).
  - A question whose nearest title above it has no options (every goals-page heading,
    a section heading written as a toggle) or that has no title above it at all is not
    cleared by a Reply: the reader keeps reporting it UNATTACHED (rule 9), which blocks
    the hand-back (checked by `scripts/decisions-handback.mjs`) and, for a goals-page
    note, an attended goals update (not checked). A note below an
    item's closed toggle, with no new title between, still belongs to that item
    (checked by `scripts/decisions-read.mjs`). Answer and archive an UNATTACHED question
    in the same pass: the `Your question, <M-D>: …` bullet under the decisions page's
    `# Closed` (not checked), then delete the owner's line (checked by
    `scripts/decisions-handback.mjs`).
- DUE: the item's `Default after …` deadline passed unanswered (reported by
  `scripts/decisions-read.mjs`). Apply the default, tell the owner in the same
  message, and close the item (not checked).
- WARN: the page is broken — Done missing, misplaced, indented outside the Waiting toggle, or duplicated, or a
  `Default` line off-shape (checked by `scripts/decisions-read.mjs`). Rewrite older
  wording into the required shape and fix before trusting anything else (not checked).
- OPEN: nothing to do. REPLIED: nothing to do until the hand-back check lists the pair
  as an `ARCHIVE` line; then archive it as above (reported by
  `scripts/decisions-handback.mjs`).

## Page shape

The page is a few toggles, named for what the owner looks for, with the detail nested inside
each one; the renderer is the only writer of that shape, and every future session follows it
without being told. The owner's rule, 10/1: "part of writing the notion is that everything
should be in toggles planned in an intelligent way to make it easy for me to find a section
then zoom in. make that part of the skill so the notion is always written in the best way by
all future sessions, not just remembering from your context. the done checkbox should be in the
'Waiting on you now' section at the end."

- Top level is toggles only: `Goal card`, `Bearings`, `Components`, `Waiting on you now`,
  `History` (checked by page-lint's `top-level-toggle` rule, which `render` runs).
- The first three are agent-owned and regenerated on every publish from the repo, never
  hand-edited: the card from `docs/goals/card.md` with its `main at <sha>`, bearings from the
  newest assessment and response under `docs/work/evidence/`, components from
  `docs/components.md` (checked by `decisions-render-sections.mjs`; a components line that names a
  `skills/`, `scripts/` or `hooks/` path absent from origin/main refuses the publish).
- The Done checkbox the owner ticks to hand back is the LAST block inside `Waiting on you now`;
  the reader, the pickup, `publish` and the hand-back all read it there (checked by
  `decisions-read.test.mjs`; a legacy column-zero Done still parses). The hand-back also compares
  the card toggle's `main at <sha>` to the head, like the Goals page (checked by
  `decisions-handback.mjs`).
- Full section list, order, and how a new section is added: `references/page-shape.md`; the same
  rule for any other Notion page is cross-referenced from `skills/notion-writing`.

## Closing

On the goals page, DELETE the item's toggle, checkboxes and all, and write ONE plain
bullet in Closed: title, what was chosen, the date, the OBSERVED result — never move or
copy the toggle (not checked). Closing an item deletes its toggle. A closed toggle left
in Closed keeps reporting TICKED or OPEN forever (partly checked: a leftover ticked
toggle reports TICKED and blocks `scripts/decisions-handback.mjs`; a leftover unticked
one reads as a live OPEN item and nothing flags it).

On the decisions page there is no page-level Closed section any more (Lane 26): closing
an item means deleting its file under `docs/decisions/waiting/` in the same commit that
appends the item's outcome — title, what was chosen, the date, the OBSERVED result — as
one bullet to `docs/decisions/history/<today>.md`, then running `decisions-render.mjs
publish`. A file left in `waiting/` after its outcome is recorded keeps rendering the
item as open forever (not checked).

## Handing the page back

Before giving the owner the decisions URL, run the hand-back check on fresh reads of
both pages (a read is two `notion.js read` calls, run through a mid-tier native-provider
runner choice is not checked) plus one `decisions-title.mjs meta` read of the decisions
page's own title and last-edit time. The check also compares the decisions read against
`docs/decisions/last-render.md`, normalised the same way `decisions-render.mjs` does,
prints a `DRIFT` line and ends with `HANDBACK page-drift` (rescued by the kill switch like
any other content objection) when they differ (Lane 26) — a page a hand or a crashed
publish edited since the last successful render is caught here, not handed back:

```
node ~/.claude/scripts/notion.js read <decisions-page-id> > <scratch>/decisions.md
node ~/.claude/scripts/notion.js read <goals-page-id> > <scratch>/goals.md
node <skill-dir>/scripts/decisions-title.mjs meta --page <decisions-page-id> > <scratch>/title-meta.json
node <skill-dir>/scripts/decisions-handback.mjs --decisions <scratch>/decisions.md --goals <scratch>/goals.md --repo . --title-meta <scratch>/title-meta.json
```

Run from the project root; `<skill-dir>` is this skill's folder (`skills/decisions` in
this repo), `<scratch>` the session's scratch folder, and `<goals-page-id>` the id on
the `[child page: Goals] (<id>)` line of `node ~/.claude/scripts/notion.js read-blocks
<goals_parent_page>` (not checked). `<decisions-page-id>` is the bare 32-hex id (the last 32 hex
characters of `decisions_url` when that is a URL): `decisions-title.mjs` refuses a URL with exit
2 (checked by `scripts/decisions-title.mjs`). `--title-meta` is required, like `--goals`; a missing
flag prints `TITLE unchecked: run decisions-title.mjs meta --page <id> and pass
--title-meta` and blocks the hand-back the same as a stale or off-pattern title (checked
by `scripts/decisions-handback.mjs`).

### Copied layout

A copied Codex skill at `~/.agents/skills/decisions` includes its canonical
`scripts/project-config.mjs` dependency. Invoke that copied helper directly and keep
the current directory at the project root; `--repo .` remains the project directory,
not the skill directory:

```powershell
node ~/.agents/skills/decisions/scripts/decisions-handback.mjs --config --repo .
node ~/.agents/skills/decisions/scripts/decisions-title.mjs meta --page <decisions-page-id> > <scratch>/title-meta.json
node ~/.agents/skills/decisions/scripts/decisions-handback.mjs --decisions <scratch>/decisions.md --goals <scratch>/goals.md --repo . --title-meta <scratch>/title-meta.json
```

An explicit `--goals` remains safe when a page is already known. An absent project config uses
the normal unconfigured defaults; without explicit `--goals`, a missing loader dependency or
malformed/unreadable project config is `BLIND` (unknown), never evidence that no goals mirror is
configured.

In a project whose `.agents/project.json` has no `goals_parent_page`
(`scripts/decisions-handback.mjs --config` prints no such line), skip the goals read and
drop `--goals`; the check then prints `goals mirror at none (not configured)` (checked
by `scripts/decisions-handback.mjs`).

Give the owner the URL only when output includes `HANDBACK ok` and its preceding summary;
exit 0 alone can mean enforcement is disabled (the exit code is `scripts/decisions-handback.mjs`'s;
that both reads were taken seconds earlier is not checked — the script reads whatever
files it is given, so rerun both reads every time). The check prints, just before
`HANDBACK ok`, a `Decisions waiting: <n>, notes logged today: <n>, goals mirror at
<sha>` line — paste it verbatim as the last line of the hand-back message, so the line
cannot exist unless the check ran (not checked by any script: the owner sees whether
the line is there). Exit 3 means a page could not be read: do not hand back, fix the
read first — rerun both `notion.js read` calls, the `decisions-title.mjs meta` read, and the check (checked by
`scripts/decisions-handback.mjs`'s exit code).

The check also prints exactly one title line: `title ok: <title>` (fresh — the last edit
ended with `decisions-title.mjs set`, above) or one of `TITLE off-pattern: <title>`,
`TITLE stale: <title> vs last edit <ISO>`, `TITLE unchecked: run decisions-title.mjs meta
--page <id> and pass --title-meta` — every one of these three blocks `HANDBACK ok` with
exit 1, the same as a COMMENTED or UNATTACHED line (checked by
`scripts/decisions-handback.mjs`).

## Keeping the goals mirror current

After a release changes `docs/GOALS.md` or `docs/goals/card.md`, render the mirror source
before the next hand-back (a stale mirror blocks the hand-back:
`scripts/decisions-handback.mjs`, stale-sha WARN):

```
node <skill-dir>/scripts/goals-mirror.mjs render --repo . > <scratch>/goals-render.md
```

Read the existing Goals child fresh, use the existing `notion-writing` skill to make
anchored targeted edits only in agent-owned mirror sections, and read it back. Preserve
surrounding human content; if a write is uncertain or an anchor changed, reconcile from
a fresh read before retrying. Initial creation uses the existing writer under normal
authority. `goals-mirror.mjs publish` is intentionally disabled and never creates or
replaces a page. `docs/pane-setup.md`'s `## Releasing` section is where this attended
step lives in a release's own checklist.

## Sub-sessions

A sub-session sends its decision UP to the session that talks to the owner:
`note-send` with `--kind ASK --needs decision` (the `multi` skill). That session
batches simple ones into one pass, after everything dispatchable is dispatched (not
checked).
