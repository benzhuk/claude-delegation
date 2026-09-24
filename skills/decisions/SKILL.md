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
(`**like this**`) is never one (checked by `scripts/decisions-read.mjs`). Never
re-type or quote the owner's line when answering it: a copied `\*\*` prefix forges a
second comment that never clears (not checked). Write and read the page through the
`notion-writing` skill: markdown endpoints only, one request per page, never a
whole-page replace, read fresh seconds before writing, a multi-line edit built from a
script with the old and new text loaded from files, not argv (not checked). On the
decisions page and the goals page, write only with anchored edits, `notion.js edit
--safe` — never `publish` or `replace-md`; render Goals with `goals-mirror.mjs render`,
then use a fresh read and targeted edits of agent-owned sections. Exit 3 or exit 4 from that edit stops the
pass: reread the page fresh, do not retry the same edit blind (checked by
`skill-text.test.mjs` that this rule is written down; the stop itself is not checked
by any script).

The page callout's owner instruction reads, written on the page as one line: "Tick a
box, or add a line starting with ** anywhere; every such line is acted on and removed
before this page comes back to you." (not checked)

New items go inside the open section, never appended past the page-level Done control
(`append-md` must not be used for this) (not checked). A checked `Done` means the owner
has submitted choices/comments for accounting; it grants no authority by itself. Account
those inputs, reconcile a changed fresh read if necessary, then clear it as `- [ ] Done
(last cleared: <America/New_York timestamp>)`. An unchecked Done is valid with zero or
open decisions; an absent Done line blocks the hand-back.

Keep the page in two sections the owner reads, `# Waiting on you now` and `# Closed`;
status narrative and logs live in the repo (`docs/work`, `docs/ledger`), not on this
page (not checked). Existing extra sections are not deleted by this skill; whether to
remove one is the lead's call with the owner (not checked).

## Reading answers

### One-shot pickup and owner accounting

An explicitly configured single pickup host may run one bounded read of the registered
decisions page and capture a checked Done with:

```
node <skill-dir>/scripts/decisions-pickup.mjs --once --page <id> --repo <project-root> --from <pickup-slug> --owner <owner-slug> --reader <notion-cli-path>
```

This command invokes the reader itself; a saved export is only a test seam, not automatic
pickup. Existing `AGENTS_HOME/ws-off` or `ws-off-decisions` disables pickup before
page reads or writes; status and attended accounting remain available. It never edits
the page or clears Done. The immutable capture lives under
the note transport's durable main-checkout `docs/notes`; the small local receipt under
`AGENTS_HOME/ws/decisions-pickup` records
dispatch recovery state only. Inspect it with `decisions-pickup.mjs status --page <id>
--repo <project-root>`. `PREPARED` may resume its saved note ID once. `SENDING` resumes
only from positive matching transport evidence; `UNKNOWN` and `NEEDS_RECONCILIATION`
must not be resent. `RECORDED` means the peer note exists, not that the choices were
carried out. A stopped or replacement owner remains a visible pending manual handoff;
do not resurrect it or dispatch the same round again.

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

After the attended owner has handled every captured `selection-NNN` and `comment-NNN`
reference and reconciled a fresh page read, write an outcome report containing
`Owner-attestation: <owner>`, a nonempty `Fresh-page-reconciliation: ...` line, and one
`Accounted-ref: <ref> ...` line for every capture reference. Then record that explicit
attestation with:

```
node <skill-dir>/scripts/decisions-pickup.mjs account --page <id> --repo <project-root> --outcome <existing-report-path>
```

Accounting does not mechanically prove the consequences and does not clear Done. Use the
existing attended fresh-read and anchored-edit route below to clear it. A later round is
admitted only after this host has observed a valid unchecked page; an invisible same-byte
uncheck/recheck between reads cannot be detected. `UNKNOWN` has no automatic repair in
this first slice.

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
- WARN: the page is broken — Done missing, misplaced, indented, or duplicated, or a
  `Default` line off-shape (checked by `scripts/decisions-read.mjs`). Rewrite older
  wording into the required shape and fix before trusting anything else (not checked).
- OPEN: nothing to do. REPLIED: nothing to do until the hand-back check lists the pair
  as an `ARCHIVE` line; then archive it as above (reported by
  `scripts/decisions-handback.mjs`).

## Closing

DELETE the item's toggle, checkboxes and all, and write ONE plain bullet in Closed:
title, what was chosen, the date, the OBSERVED result — never move or copy the toggle
(not checked). Closing an item deletes its toggle. A closed toggle left in Closed
keeps reporting TICKED or OPEN forever (partly checked: a leftover ticked toggle
reports TICKED and blocks `scripts/decisions-handback.mjs`; a leftover unticked one
reads as a live OPEN item and nothing flags it).

## Handing the page back

Before giving the owner the decisions URL, run the hand-back check on fresh reads of
both pages (a read is two `notion.js read` calls, run through a mid-tier native-provider
runner choice is not checked):

```
node ~/.claude/scripts/notion.js read <decisions-page-id> > <scratch>/decisions.md
node ~/.claude/scripts/notion.js read <goals-page-id> > <scratch>/goals.md
node <skill-dir>/scripts/decisions-handback.mjs --decisions <scratch>/decisions.md --goals <scratch>/goals.md --repo .
```

Run from the project root; `<skill-dir>` is this skill's folder (`skills/decisions` in
this repo), `<scratch>` the session's scratch folder, and `<goals-page-id>` the id on
the `[child page: Goals] (<id>)` line of `node ~/.claude/scripts/notion.js read-blocks
<goals_parent_page>` (not checked).

### Copied layout

A copied Codex skill at `~/.agents/skills/decisions` includes its canonical
`scripts/project-config.mjs` dependency. Invoke that copied helper directly and keep
the current directory at the project root; `--repo .` remains the project directory,
not the skill directory:

```powershell
node ~/.agents/skills/decisions/scripts/decisions-handback.mjs --config --repo .
node ~/.agents/skills/decisions/scripts/decisions-handback.mjs --decisions <scratch>/decisions.md --goals <scratch>/goals.md --repo .
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
read first — rerun both `notion.js read` calls and the check (checked by
`scripts/decisions-handback.mjs`'s exit code).

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
