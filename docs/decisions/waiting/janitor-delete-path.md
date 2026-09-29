<details>
<summary>**Temp deletes without prompts: one allowlisted deleter**</summary>
	Every session that runs rm hits your permission prompt, because rm is ask-first and the delete guard denies it to subagents. Making rm itself prompt-free is not safe. The fix is one deleter script in the plugin that deletes only inside known classes: session scratchpads, the plugin's temp folders under the OS temp directory, finished lane worktrees, and merged branches. It refuses any other path and lists what it removed. One allow line in each machine's local Claude settings names that script, so every session and subagent calls it without a prompt while rm stays gated. Sessions then stop asking you to delete.
	- [ ] Yes, build the deleter and add the allow line on all four machines (recommended)
	- [ ] Hold
	No default: sessions keep asking until you tick
	<empty-block/>
</details>
