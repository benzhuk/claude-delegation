<details>
<summary>**Knowledge triage is stopped: clear its ATTENTION on Windows**</summary>
	The first knowledge-triage run on Windows (10/1) processed and archived 60 of 80 notes and committed its result in the chezmoi source repo, but could not push: three secret-guard commits landed on origin during the run, so its main diverged. It wrote ATTENTION and left .curated-update.lock, and the ATTENTION text reserves recovery to you, never an agent. The 5:00 AM task skips until it is cleared. The fetch-before-publish fix goes to the next reliability lane.
	- [ ] Done by hand: rebase that commit onto origin in the chezmoi source repo, push, then remove ATTENTION and .curated-update.lock (recommended)
	- [ ] Not doing this, because [reason]
	No default: needs your hands
	<empty-block/>
</details>
