<details>
<summary>**Cleanup: what happens to unmerged lane work in claude-delegation**</summary>
	On 9/30 I removed 38 of 45 claude-delegation worktrees on Windows, 6 on Netcup and 1 on Hetzner, without force. Leftover logs and reports in 13 of them were committed locally on their lane branches first. About 20 branches in the Windows checkout now hold commits that are on no remote and not in main (the astra-* set, lane 40 and 40b source and test branches, lane 55, archive/* branches). One abandoned merge from 9/27 (codex-census-1-final-main-merge) is stuck in a conflict and still has its worktree.
	- [ ] Keep them as local branches, delete nothing (recommended: costs no disk worth naming, and nothing is lost)
	- [ ] Push them all to origin as archive branches, then delete the local ones. The repo is public, so their content becomes public.
	- [ ] Delete every branch not merged into main, and discard the abandoned merge. This cannot be undone.
	No default: the branches stay local until you tick
	<empty-block/>
</details>
