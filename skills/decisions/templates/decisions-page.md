# The decisions page — a render, never a fill-in shape

Unlike `decision-item.md`, nothing here is copied onto the live page by hand. The
page is composed once, in full, by `scripts/decisions-render.mjs render` (a pure
function of the repo) and written by `scripts/decisions-render.mjs publish` (the
only thing ever allowed to write it — see `SKILL.md`'s Page rules). This file
documents the shape that composition produces, so a source-file edit's effect on
the rendered page is predictable without running the renderer first.

## The sections, in order (every one a toggle; see `references/page-shape.md`)

```
# Goal card {toggle="true"}
	main at [short sha of the last commit that changed the goals sources]
	[docs/goals/card.md, every line]
	<empty-block/>
# Bearings {toggle="true"}
	Decision: [CONTINUE, RE-PLAN or CUT] ([date]).
	Condition: [only when the assessment states one]
	Next action: [from the assessment]
	Prediction, check [M/D H:MM AM/PM]: [from the lead response]
	Links: [Goals page](...), [assessment](...), [response](...).
	<empty-block/>
# Components {toggle="true"}
	- [name] ([state]): [what it does for the goal]
	  ...one line per component in docs/components.md...
	<empty-block/>
# Waiting on you now {toggle="true"}
	[one block per file under docs/decisions/waiting/, in file-name order, or
	 "Nothing right now." when that directory is empty or absent]
	## What is going on
	[docs/decisions/now.md, verbatim, 3 to 5 sentences, no bold, no hex-like tokens]
	## This session (since your tick at [Day H:MM AM/PM, America/New_York])
	[docs/decisions/session.md's bullets, verbatim, in file order, at most 8, each
	 at most 200 characters]
	<callout icon="✅">
		To comment, start a line with `**` anywhere on this page, then tick Done to
		submit; the answer appears here and the exchange is kept in that day's
		history file.
	</callout>
	- [ ] Done (last cleared: [Mon D, YYYY, H:MM AM/PM America/New_York])
	<empty-block/>
# History {toggle="true"}
	- [Mon D](.../docs/decisions/history/YYYY-MM-DD.md) — [that file's Summary: line]
	  ...one bullet per history file, newest first...
	- Everything before today's rewrite is kept, byte for byte, in the
	  [Mon D archive](.../docs/decisions/archive/decisions-page-YYYY-MM-DD.md).
	  ...one bullet per archive file...
	<empty-block/>
```

- **Goal card**: `docs/goals/card.md` in full, with `main at <sha>` (the sha `goals-mirror.mjs`
  `computeSha` returns). The hand-back compares it to the head. Never hand-edited.
- **Bearings**: the newest `docs/work/evidence/<date>-bearings-assessment.md` and its `-response.md`:
  the verdict word on line 1, the `Condition:` and `Next action:` lines of the assessment, the
  `Check on <M/D H:MM AM/PM>:` line of the response. Any field missing refuses the render.
- **Components**: `docs/components.md`, one line per component, state word one of fed, measured,
  unfed, partial, missing. A backticked `skills/`, `scripts/` or `hooks/` path that is absent from
  `origin/main` refuses the render.

## Where each remaining section's bytes come from

- **Waiting**: every `docs/decisions/waiting/*.md` file, in file-name order
  (`decision-item.md`'s fill-in shape — a toggle with checkbox options). A file
  with no options, or that fails `decisions-read.mjs`, refuses the whole render
  (`RefusedError`, exit 2): a shapeless item is invisible to the owner, so it
  never reaches the page at all. Deleting a waiting item's file — once its
  history bullet records the outcome — is how an item closes; see SKILL.md's
  "Closing" section.
- **What is going on**: `docs/decisions/now.md`, one paragraph, 3-5 sentences,
  no owner-input leaks (`**`, sha-shaped hex).
- **This session**: `docs/decisions/session.md` — line 1 is `since: <ISO>`
  (only ever rewritten by `publish --clear-done`, never by hand), then up to 8
  bullets.
- **History**: one bullet per `docs/decisions/history/YYYY-MM-DD.md` file,
  newest first, built from that file's required line 2, `Summary: <one
  sentence>` — the file itself holds the day's full detail; the page only
  ever shows the summary and a link. Every linked history/archive file must
  actually be tracked on `origin/main` (`git ls-tree`) or the render refuses:
  a 404 link never publishes.
- **Archive**: one bullet per `docs/decisions/archive/decisions-page-*.md`
  file (oldest to newest) — the one-time, byte-for-byte snapshot taken when
  this page was first redesigned into a render (2026-09-27). No new archive
  file is expected in ordinary operation.
- **Done**: `- [ ] Done (last cleared: <timestamp>)`, the last block inside the Waiting
  toggle, written only by `publish` — never by hand, never left as a bare `- [ ] Done`
  once a round has cleared it once.

## What never appears here

An owner's typed `**` line or a ticked checkbox is captured privately by
`decisions-pickup.mjs` and never rendered back: the answer goes into the
relevant history file or waiting item instead (see SKILL.md's "Reading
answers"), so a handled note simply does not reappear on the next render.
