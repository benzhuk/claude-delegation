VERDICT: REWORK_M2

Spec red-team, merge-on-acceptance-1, base 6d8ba95 (worktree tip 621db82). Read-only. Line numbers are at base.

## 1. What registered pickup already does, and how M2 maps onto it

Mechanism: after an ordinary standalone `note-flush` pass (the one-minute timer), `runPostFlushPickup` (skills/multi/scripts/note-flush.mjs:1149-1192, called at :1257) probes `~/.agents/ws/decisions-pickup/registrations.json`. If the file exists, it imports `decisions-pickup.mjs` and calls `runRegisteredPickup` (decisions-pickup.mjs:676-722). That call picks one entry at random (:695) and runs `pickupOnce` (:849).
- Page read: the entry's `page`. It must equal the repo's `.agents/project.json` `decisions_url` (`registeredProject`, :562-571), which is the same source the attended reader uses (decisions SKILL.md:197-199). The read is one spawn of the registered reader CLI, `<reader> read <page>`, which is `notion.js` and needs `NOTION_TOKEN` (~/.claude/scripts/notion.js:35-37) (:538-560).
- What it sends and to whom: one `note-send` ASK, `needs ack`, from `entry.from` to `entry.owner` (the owner slug). Text: "Owner decisions pickup round N is ready". The Details field is a sanitized pointer (`sendInputs` :467-477, dispatch :812-846, `--no-type`).
- At most once: this is per round, not per flip. A RECORDED receipt never resends (:1049-1050; test decisions-pickup.test.mjs:302). A new round needs `account` first (:1206-1254) and then an observed unchecked Done (:1018-1024, :1035; test :460). A checked Done with zero ticks or comments is NO_ACTION with no send (:1092; test :768).
- Timeout against the budget: the pickup runs only after the drain has finished and written its heartbeat, and only if the drain took under 30 s (`PICKUP_ADMISSION_MS` note-flush.mjs:130, :1175). Otherwise it reports `PICKUP_SKIPPED_BUDGET`. The reader is `spawnSync` with a 15 s timeout (decisions-pickup.mjs:24, :545), mapped to READER_TIMEOUT (test :960). A slow Notion never delays a drain. The drain budget itself is 100 s (note-flush.mjs:78).
- Kill switches: `~/.agents/ws-off` and `~/.agents/ws-off-decisions`, checked in note-flush.mjs:1159-1160 and decisions-pickup.mjs:98-101, :680, :854. They take effect before any registration read or page read (contract test :58).
- When unconfigured: one lstat, then `return null` (note-flush.mjs:1164, :1184). It writes no log line and no heartbeat annotation. On Netcup `flush-last.json` has no `pickup` key, and `~/.agents/ws/decisions-pickup/` does not exist (verified live). When configured but failing (for example a missing token, which gives READER_EXIT_1), the pass writes `pickup:{code:"PICKUP_FAILED"}` into flush-last.json and nothing else (:1185-1191).

| M2 requirement | Mapping |
|---|---|
| Read page once per drain, from the configured id | already met: decisions-pickup.mjs:562-571, :915-917 |
| State file | already met, in a different place: a receipt at `ws/decisions-pickup/<sha>.json` (:103-115), not next to flush.log |
| Post one wake line to the owner-lead's inbox | already met: ASK to `owner` (:467-477). Text differs; keep the existing text |
| At most one line per flip | **conflicts**: one per accounted round. A flip before `account` is silent forever (:1049) |
| false→true posts once; true→true posts nothing | already met: tests decisions-pickup.test.mjs:257, :302, :460 |
| Missing token logs and does nothing | partly met: no send, PICKUP_FAILED annotation (test :940-960). No log line |
| `decisions-check skipped` logged once per hour | **gap**. It also **conflicts** with the pickup-integration contract: "No extra status/history file" and no output when unconfigured (docs/specs/2026-09-24-pickup-integration.md:24). An hourly throttle needs new state |
| Kill switch `~/.agents/notes/no-decisions-check`, fails open | **conflicts**: `ws-off-decisions` already exists. A second name for the same switch is a new part. The existing switch fails safe: a stat error means disabled (:94) |
| Times out under the drain budget | already met: post-drain, 30 s admission, 15 s reader |
| No new process, no faster polling | already met: the same timer, the same pass |

The spec's M2 is therefore a second Notion reader beside an unfed one. GOALS.md:24 says "feed it first".

**F1 (high): feeding it as-is will wedge it once M1 lands.** With a RECORDED round and Done still checked, any page edit changes the digest and moves the receipt to NEEDS_RECONCILIATION (decisions-pickup.mjs:1003-1007; test :376). `account` refuses anything that is not RECORDED (:1221), and no command repairs it (SKILL.md:135-136, :194-195). M1 adds page writers: every lane lead posting a Closed entry, plus the owner lead's own handling edits, which SKILL.md:76-78 orders before clearing Done. One such write in the Done-checked window silences the Done wake for that page until someone repairs it by hand. Rule for decisions SKILL.md (M1 owns the file):
  1. The owner lead's first write in a pickup round clears Done. The capture is immutable, so nothing is lost; handle the items from `open` plus fresh reads. Then run `account`.
  2. A lane lead whose fresh read shows Done checked does not write the page. It puts the Closed entry verbatim in its RESULT, which is the existing Codex fallback (team-build SKILL.md:262-264), and the owner lead posts it after clearing Done.
  3. Every round ends with `account`, or later ticks never wake anyone.

## 2. Smallest M2: feed registered pickup

Code change needed: none for the wake itself. Optional, and the only code I'd keep: in `buildFlushStatus` (note-flush.mjs:325-331), append `; pickup: <code> <age>` from `heartbeat.pickup`, or `; pickup: not registered on this host` from one lstat of the registration path. That makes the unsupported state explicit with zero new state and no log throttle. Test it in skills/multi/scripts/note-flush.test.mjs: three cases (absent file, present annotation, disabled switch). Mention it in skills/multi/SKILL.md:121-124. About 8 lines of code.

Docs: the F1 ordering rules above, plus one sentence in decisions SKILL.md:113-120 naming the pickup host rule below.

Host: the pickup host must be the host where the owner lead's inbox lives, because note-send only delivers on the recipient's own host (note-send.mjs:18, :798-801). A Netcup registration naming `skills-fable` would leave a queued wake with no inbox, dead-lettered after 10 minutes (note-flush.mjs:341). So the host is Windows, where skills-fable runs.
- Windows already had a registration. It was bound to `skills-a` and paused because of the archive-shapeless reader bug (docs/work/evidence/registered-pickup-live-0205.md:7-9). That bug is fixed at base (a05cf86, fd84222; SKILL.md:96-100). No receipt was ever created, so no owner binding blocks a new owner.
- The step is to restore the registration with `owner: skills-fable` and `from: <pickup slug>`. The repo is the Windows checkout and the reader is the absolute path to `notion.js`, outside git.
- Then run `decisions-pickup.mjs status`, then one manual `--once`, then confirm `note-flush --status --json` shows a `pickup.code` other than PICKUP_FAILED. That last check proves the Windows timer's environment carries `NOTION_TOKEN`. The unit on Netcup, for comparison, has no Environment line.
- Who does it: this cannot be a build deliverable. The SKILL.md:119-120 rule forbids creating it "merely because the plugin is installed", and the pickup-integration spec at :17 says "no activation by builders". It changes the owner's machine. It must be Ben's word: either a `Done by hand` item, or Ben saying so in skills-fable's Windows pane, with skills-fable as the host owner writing the file.

## 3. M1: sentences replaced, and contradictions

Replace:
- team-build SKILL.md:256-264, from "After that `accept --census` … push the branch with its accepted record; then the lane lead posts its own merge item for that branch …" through "…carries the merge item text verbatim in its RESULT instead, so the collector still finds the branch."
- team-build SKILL.md:287-289: "before the merge ask, so its numbers go into it, not after `accepted`, which is downstream of that decision".
- team-build SKILL.md:380: "push the branch, post its merge item to the decisions page (Ship), and only then send ONE RESULT."
- decisions SKILL.md:56-68, the whole "A lane lead's own merge item …" paragraph. Keep its two-writers and exit-3 retry sentences (:63-68) for the Closed entry.
- template decision-item.md:28-31, the "A lane lead's own merge item …" paragraph including "`No default: merges to main take your word per item`".

Wrong premise in M1 item 3: "installs take your word per item" exists nowhere in the repo (checked with grep). No shared No-default line holds both phrases; the merge phrase lives only in the merge-item shape. Ruling: delete the merge-item shape, and add the release item's `No default: installs take your word per item` as new text.

Contradictions outside M1's named files:
- **docs/GOALS.md:21** says "Ben's word is needed only to merge to main or touch a machine". M1 contradicts it directly. Ben's 10:55 statement arguably authorizes the edit, but GOALS.md is mirrored to Notion (SKILL.md:313-315). Rule whether M1 edits it and re-renders the mirror, or the release does it on Ben's word.
- **docs/pane-setup.md:117** ("the merge ask `<project>-fable` puts on the decisions page"), :38 ("for the actual ship decision") and :10-11 ("the only pane that writes the decisions page") contradict lane leads merging and posting. Add these to M1.
- **docs/census.md:352** ("at every merge tick") is where the collector is described. M1 item 4's sentence goes here.
- **team-build SKILL.md:280-281** says "integration changes or conflict resolutions do [need re-review]". M1's "the lead resolves additive prose" conflicts. Rule either that an additive-prose resolution needs no re-review but needs a suite re-run on the merge result, or that any resolution is a Waiting item.
- **Missing gate**: the suite is green on the branch, not on the merge result. If `origin/main` is not an ancestor of the branch tip, run the sealed suite on the merge commit (at least one host) before pushing main.
- Where the second-host evidence lives: after `accept`, any record change needs a fresh check (team-build SKILL.md:276-278). Rule that the second-host gate log is committed as record evidence before `accept`, as lane six did with reports/integrate-win-gate.log. It must not be appended after.
- GOALS.md:25 says "a rule no script checks". The second-host condition and the four-hour defect are unchecked. Mark them "(not checked)" per the house style, or accept the collector's `hoursSinceLog` + `accepted-unmerged` (collect-from-origin.mjs:112, :116, :133) as the check for the four-hour rule.

Test pins:
- No script or test pins the merge-item phrases (grep of *.mjs/*.js/*.json is empty).
- Watch skills/decisions/scripts/skill-text.test.mjs:50 and :57, which pin exact line wraps at SKILL.md:49-50 and :307-308. Do not rewrap those lines.
- Also watch skill-text.test.mjs:43-44: no line may start with `**`. The Closed entry must not start with bold.
- scripts/work-record.test.mjs:1815-1827 slices 800 chars from "Run the census at accept time" (team-build SKILL.md:251). Edits must start at :256 or later and leave :251-254 intact.
- `collect-from-origin.mjs` needs no flag. Remove it from M1.

## 4. Other ambiguity

- M2's text "hooks/lib" means only `hooks/lib/goal-context.mjs`, which is unrelated. Drop it.
- M2's "state file next to flush.log" would duplicate the receipt.
- The spec's acceptance "Opus reviewer per territory" for M2 now covers the status-line change, plus a check that the existing tests at decisions-pickup.test.mjs:302/:460/:940-960 and the contract test at :167 answer the three attacks. They do.
- Dogfood: the Closed entry for this build needs Done unchecked (per F1), or it goes in the RESULT.
- One owner per page: only the spec lead is woken, and it routes to lanes. Changing the owner mid-round becomes a manual handoff (SKILL.md:131-133).
- A page warning (for example "non-decision item under Waiting", decisions-read.mjs:341) makes the pickup INVALID, which means no wake and only a heartbeat code. The status-line addition surfaces this.

## Territory map (each file in exactly one territory)

- M1, docs only: skills/team-build/SKILL.md; skills/decisions/SKILL.md (also carries the F1 rules and the pickup-host sentence); skills/decisions/templates/decision-item.md; docs/census.md; docs/pane-setup.md; docs/GOALS.md only if ruled in.
- M2, reduced: skills/multi/scripts/note-flush.mjs (`buildFlushStatus` only); skills/multi/scripts/note-flush.test.mjs; skills/multi/SKILL.md.
- Removed: scripts/collect-from-origin.mjs; hooks/lib; skills/decisions/scripts/decisions-pickup.mjs (unchanged).
- Host step: `~/.agents/ws/decisions-pickup/registrations.json` on Windows, written on Ben's word. Not a build file.

Goal lines served: M1 serves "hours ask to accepted" and "work lost or stalled". The nearest NOT is "a rule no script checks" (second-host gate). M2 as reworked serves "work lost or stalled". The nearest NOT is "a new mechanism while an existing one is unfed", which is why it becomes feed-plus-registration.
