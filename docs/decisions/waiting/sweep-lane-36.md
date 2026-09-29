<details>
<summary>**One-time cleanup sweep (lane 36)**</summary>
	Lane 36 (closeout) is merged. This sweep removes leftovers from finished lanes, once. On origin it deletes 29 merged build branches (lane 37's build/codex-parity-37 is kept while that lane is open). Each name and tip commit is written to the sweep record, so any branch can be restored (the list of 29 names and tips is in the sweep record, not here). On each host the janitor removes only its SAFE class, meaning merged branches and worktrees with fully clean trees. Hetzner has 3 worktrees and 3 branches (the janitor-daily-1 J1-J3 leftovers). Windows has 18 worktrees and 19 branches. Netcup can't be reached from Hetzner (ssh host-key check failed, not bypassed), so its count comes from its own janitor run on the day. The record lists before and after counts per host. Unmerged branches stay: feat/working-smarter, docs/bearings-0925 through 0928, build/fresh-walk-1, build/gate-under-load-1 and docs/lane-specs-0925. Ticking yes means skills-h runs it at that moment.
	- [ ] Yes, run the sweep
	- [ ] Hold
	No default: nothing is deleted without your tick
	<empty-block/>
</details>
