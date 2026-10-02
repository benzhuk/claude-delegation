UPDATED

# Goals mirror check, 2026-10-01 20:17 -04:00 (America/New_York)

Page: https://www.notion.so/3e3da11277a1813cb326c42ed97a1d5d (Goals). Decisions page read only: 3e1da11277a18174bccfea187d5c3972.

## 1. Render (`goals-mirror.mjs render --repo .`, exit 0, 116 lines, saved in scratchpad)

The card (GOAL, NOT, DONE, STOP, SOURCE) is the Detail toggle's callout, after the state table; the first 20 lines of the render are the mirror callout plus the table (main at 14174e81, the last commit touching docs/GOALS.md and docs/goals/card.md). First 20 lines:

<callout icon="🎯" color="gray_background">
	**Mirror of `docs/GOALS.md` and `docs/goals/card.md` in the plugin repo, main at 14174e81.** To comment, add a line starting with ** anywhere on this page. The lead acts on every such line, changes the repo, then uses a fresh targeted attended update and read
</callout>
| State | Goal | Summary | Date |
| --- | --- | --- | --- |
| <span color="red">**UNKNOWN**</span> | The aim |  | undated |
| <span color="orange">**PARTIAL**</span> | Cut token cost hard, lose no benefit | The ladder runs (Fable spec, Opus loop, Sonnet builders). | 2026-09-22 |
| <span color="orange">**PARTIAL**</span> | Speed and quality count as much as tokens | One speed census: the lead's dispatch latency was 29 percent of a build's wall clock. | undated |
| <span color="orange">**PARTIAL**</span> | The lead spends judgment, not turns | 19 and 67 orchestrator turns on the two loop builds against 152 turns (no source record; 2026-09-25 bearings O9). | 2026-09-25 |
| <span color="orange">**PARTIAL**</span> | Simplest architecture, rethought from the aim | The card hook shipped in 0.8.0; the card was first written 2026-09-22. | 2026-09-23 |
| <span color="orange">**PARTIAL**</span> | Progress is checked by a fresh agent, not by the one doing the work | The bearings skill shipped in 0.16.0 and one baseline ran on 2026-09-23; the reviewer was not independent of the lead. | 2026-09-24 |
| <span color="orange">**PARTIAL**</span> | Any agent host, Codex and Claude Code first | Skills, roles and hooks mirror to Codex; a Codex-led build through the plugin has not been run end to end. | undated |
| <span color="orange">**PARTIAL**</span> | One package, the same on every machine, tested everywhere at once | Windows, Mac, Hetzner and Netcup installed the 0.20.6 release on 2026-09-24 through their existing Claude marketplace/plugin route and Codex shared 
| <span color="orange">**PARTIAL**</span> | Nothing stalls silently | On 2026-09-23 three notes to the Codex lead were marked seen without reaching it, and a blocked deploy was never reported; the launcher and cursor defects were fixed in 0.18.1. | 2026-09-25 
| <span color="orange">**PARTIAL**</span> | Decisions and goals have one home that Ben reads | The reader, hand-back check and pickup shipped in 0.14.0 to 0.17.0; the scheduled pickup ran unattended on Windows at 8:25 AM on 2026-09-24 and returned PICKUP_NO_AC
| <span color="red">**NONE**</span> | What one session learns reaches every machine | Memory never syncs. | 2026-09-27 |
| <span color="orange">**PARTIAL**</span> | Cleanup has an owner | Janitor reports (48 SAFE, 5 JUDGMENT on 2026-09-22) but is unscheduled; it has acted once: Ben chose to apply its safe class on 2026-09-26 and Windows went from 60 worktrees to 19 (docs/decisio
# Detail {toggle="true"}
	<callout icon="🃏" color="blue_background">
		**Five-line project card** (rendered from source; installed host injection coverage is unknown)

The card lines (render lines 21-26):

		GOAL: Agent work gets cheaper, faster and more reliable at equal or better quality, on any agent host, Codex and Claude Code first. Change only what improves one of these and worsens none: top-tier 
		NOT: waiting to be asked. NOT: more parts than the simplest design; a symptom fix. NOT: a new mechanism while an existing one is unfed or unmeasured. NOT: a rule no script checks. NOT: top-tier exec
		DONE: a build goes spec to accepted through the plugin, led once from Claude and once from Codex with a mixed handoff: lead under 20 turns, mid tier builds, high tier reviews, nothing lost or stalle
		STOP: bearings says RE-PLAN twice in a row or CUT: stop that lane, put it on Ben's page, work another.
		SOURCE: docs/GOALS.md
		GOAL, NOT, DONE, and KILL are source labels, not attributed quotations. Verify the source and `main at` version before an attended publication; the card is capped at 800 bytes by a plugin constant.

## 2. Live page, fresh read

Present but STALE. The card's GOAL, NOT, DONE and STOP lines matched the render exactly. The card carries no date; its version marker is "main at <sha>". Differences found (autolink and escaping differences like `[GOALS.md](http://GOALS.md)` are Notion round-trip noise and were ignored):

- Callout: live "main at 7b00418." vs render "main at 14174e81."
- Table row "The lead spends judgment, not turns": live "against 152 hand-run" vs render "against 152 turns" (same phrase repeated in that goal's toggle under Detail).
- Table row "Decisions and goals have one home that Ben reads": live date 2026-09-24 vs render 2026-09-28.
- Table row "Cleanup has an owner": live date 2026-09-22 vs render 2026-09-26.

Decisions page: it mentions "the Goals page" once in the "What is going on" prose (line 11) but holds no link to it: no page URL, no mention or link to id 3e3da112 anywhere. Not written to.

## 3. Edit (anchored, `notion.js edit --safe`, 5 edits, each preceded by a fresh read that matched the base)

Edits, all in the agent-owned mirror (callout, table, Detail toggle): sha 7b00418 to 14174e81; "152 hand-run" to "152 turns" (table cell and Detail toggle); two table date cells. Old and new text came from files (--old-file/--new-file). Each edit exited 0 with 1 line removed and 1 added, no UNEXPECTED REMOVED. Backups under ~/.local/state/notion-backups/3e3da11277a1813cb326c42ed97a1d5d/ (2026-10-02T00-16-45Z through 00-16-59Z).

Readback (fresh read after the last edit): identical to the expected edited text; 284 lines, 2 details and 17 toggle headings both before and after; 4 Bearings sections intact; table rows (12) and Detail card now match the render under the same normalization.

## 4. Lint

`page-lint.mjs final.md --kind plain` on the fresh read: clean, exit 0 (also clean before the edit).

Nothing committed or pushed. Nothing written to the decisions page. No Claude or AI attribution written.
