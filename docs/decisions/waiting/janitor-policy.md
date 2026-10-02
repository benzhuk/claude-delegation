<details>
<summary>**Janitor policy, one tick**</summary>
	You asked whether the janitor stops the 9/30 mess from recurring. It does not yet. Lane 74 builds the classes below; they act only after this tick and until then report what they would do. Roots: every git repo under ~/Code, <repo>/.claude/worktrees, the session Temp scratch root, orca/workspaces, /var/tmp/lane-*. Never BTO, never dotfiles.
	- [ ] Dirty worktree with no open record, idle 24 h: commit all of it to archive/<name>, push, remove the worktree (recommended)
	- [ ] Unmerged local-only branch with no open record: push as archive/<name>, delete locally (recommended)
	- [ ] Merged origin branches: delete daily (recommended)
	- [ ] Deregistered worktree folders under the roots: archive if they hold changes, then remove (recommended)
	- [ ] Untracked files older than 7 days in a durable checkout: report by path only, never remove (recommended)
	- [ ] Not yet, keep report-only
	Default after 2026-10-03 12:00 -04:00: the five recommended lines
	<empty-block/>
</details>
