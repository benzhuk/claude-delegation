<details>
<summary>**Cleanup: leftovers directly in the Windows Code folder, and keeping it clean**</summary>
	Directly in Code on Windows: eight folders that hold only a pack file (autolink-guard, decisions-render, four-read, janitor-fed, janitor-origin, knowledge-counted, render-guard, windows-task), three empty folders (census-completeness, Claude-Work, decisions-actions), three scratch folders (scratch-l59b-win1, scratch-l60c-win1, scratch-l60c-win2), the now-empty worktree parents (claude-delegation-wt, delete-deny, notion-writing), and a stray macOS file. Under orca/workspaces/claude-delegation there are 19 empty folders, and under orca/gates 18 standalone clones and 12 orphaned copies from closed lanes. The cause is that lane leads picked their own worktree locations. The fix is one rule with a check: every worktree and gate tree goes under one root outside Code, the dispatch guard refuses a worktree path inside Code, and the janitor reclaims that root.
	- [ ] Delete all of the leftovers listed, and build the one-root rule with its guard as the first lane when work resumes (recommended)
	- [ ] Delete the leftovers only
	- [ ] Build the rule only, I will clear the folders myself
	No default: nothing is deleted until you tick
	<empty-block/>
</details>
