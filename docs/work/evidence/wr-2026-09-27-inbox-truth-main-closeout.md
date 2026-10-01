VERDICT: CLOSED

# Lane 29 main closeout — inbox truth

## Delivery chain

- Reviewed source artifact: `c8c16be67ef4e832e90ec2f78ebdf570001fd60f`.
- Sealed candidate: `d1345220822651c762fa5a5a461e5bbe94620c7c`;
  its three owned source files and two owned tests are byte-identical to the
  reviewed source artifact.
- Accepted lane tip: `1a71fa16dfe759d7e86a70a66d17d20ab7f8fec9`.
- Main merge: `83b0966360681c16c3961f07d448438abef9453e`, with parents
  `53a77f79943aca31bb03bdad1553ba923bb06c6c` and the accepted lane tip.
- `docs/decisions/history/2026-09-27.md` contains one plain published history
  bullet for `build/inbox-truth-1` and its accepted lane SHA.

The implementation distinguishes unchecked packet existence from an absent
packet, renders the three values strictly, and documents Codex queue delivery.
It adds no release or installation; the live proof used the repository copy,
so installed hooks remain unchanged until a separately authorized release and
install.

## Verification and live proof

- Builder focused gate: 67 passed, 0 failed, 0 skipped.
- Independent candidate contract gate: 70 passed, 0 failed, 0 skipped.
- Windows sealed suite: 2,480 passed, 0 failed, 2 skipped.
- Netcup actual sealed suite: 2,478 passed, 0 failed, 4 skipped, from fetched
  exact candidate and verified runner directory.
- Two real ledger-only proof notes with the same existing packet returned
  `packetExists: null`, `packetChecked: false`, and no problems under
  `--no-repo`; the repository check returned `true`, `true`, the canonical
  packet path, and no problems. All proof native exits were 0.

Netcup had two Node launches and one actual suite. The first launch used the
correct fetched checkout but omitted `cd`, so Node failed to resolve the
runner; zero tests ran. Its raw receipt and the root adjudication are retained.
The corrected launch was the first actual suite and passed. An earlier local
PowerShell parser error occurred before SSH or Node started; its raw text was
not retained separately.

## Measured outcome and limits

At the shared instant `2026-09-27T23:24:38.7002014Z`, the four-read reported
9,256,726 top-tier tokens (6,727,644 build plus 2,529,082 spec), 0.3 hours,
zero observed post-acceptance commits and re-accept logs in an immature
seven-day horizon, and native stall classification unavailable. It observed no
native response gap above 30 minutes and one unanswered ASK snapshot. These
are measurements and limitations, not a demonstrated four-measure improvement.

## Checked closure

The first close attempt supplied a seven-digit-fraction PowerShell timestamp.
`work-record.mjs close` rejected it with `invalid-at` and made no record
mutation; `L29-live-close-invalid-at.log` and `.exit` preserve that input and
native exit 1. A fresh millisecond ISO timestamp then completed the single
checked close against merge `83b0966360681c16c3961f07d448438abef9453e` with
native exit 0; `L29-live-close.log` and `.exit` preserve the result. The
record's code-generated closed Log is `2026-09-27T23:33:13.860Z`.

## Decisions publication

The checked-closure docs landed on main at
`e80cf9e56147143e9bf4e24580ed5ae70b9f67be`. The existing decisions renderer
published from an isolated clean main clone on September 27, 2026, at
7:35 PM America/New_York, native exit 0. It performed its fresh read and
verified readback, retained a pre-write backup and updated the title. It
reported nothing to commit because last-render.md and session.md already
matched the readback. Raw output and exit are in L29-decisions-publish.log
and L29-decisions-publish.exit. No manual Notion edit was used.

## Retained worktrees and artifacts

No cleanup action was taken. Retain the two Lane 29 Windows worktrees
`C:\Users\benzh\orca\workspaces\claude-delegation\inbox-truth-1` and
`C:\Users\benzh\orca\workspaces\claude-delegation\inbox-truth-1-builder`,
the reused main checkout
`C:\Users\benzh\orca\workspaces\claude-delegation\codex-census-1-final-main-merge`,
and the Netcup fetched gate checkout
`/home/ben/orca-gates/inbox-truth-1-d134522082`, plus the isolated publisher
clone `C:\Users\benzh\orca-gates\inbox-truth-1-publish`. Root retains cleanup
ownership; cleanup eligibility was not reassessed during this lane.
