<details>
<summary>**Cleanup: which unmerged branches to keep and which to discard**</summary>
	An Opus reviewer read all 50 unmerged claude-delegation branches on four machines (39 Windows, 8 Netcup, 2 Hetzner, 1 Mac). 38 hold nothing main lacks: main already has their content, or they are only logs and reports of closed lanes, and no ruling exists only on one of them. Three are lane 62, paused mid-build, and stay. That leaves nine that hold something real. Six docs branches (docs/bearings-0925 to 0929, docs/lane-specs-0925) hold 19 daily bearings files, 18 lane specs and the first janitor sweep evidence that are not on main; main links to them by branch name 64 times. build/fresh-walk-1 was approved on 9/26, its blocker has since been fixed, and it was never merged; it also fixes a wrong script name in the goal-card error message that is still on main. feat/working-smarter holds three process templates that were deliberately cut on 9/21. build/janitor-inodes-1 is lane 45, built, never reviewed, and main's janitor has moved 661 lines since.
	- [ ] Discard the 38. Merge the files of the six docs branches into main in one docs commit, repoint the links, then delete those branches. Keep fresh-walk-1 as the one branch to land when work resumes. Discard working-smarter and janitor-inodes-1. (recommended: ends with lane 62 and fresh-walk-1 as the only branches besides main)
	- [ ] Discard the 38 only, keep the other nine as they are
	- [ ] Discard everything except lane 62, and take the one-line goal-card fix into main by itself
	No default: no branch is deleted until you tick
	<empty-block/>
</details>
