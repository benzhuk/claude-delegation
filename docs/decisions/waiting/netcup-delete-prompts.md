<details>
<summary>**Delete prompts on Netcup: restart the stale BTO session or drop the blanket rule**</summary>
	You still get "rm -rf ... requires confirmation" prompts from a delegation:integrator agent on Netcup. Two causes, both verified from the session transcript: the BTO session in that pane started 2026-09-20 and still runs plugin 0.1.1, which has no delete guard, so its integrator issues deletes the current agent file forbids; and the user-level settings on Netcup list "Bash(rm -rf *)" under ask, which outranks the project's allow lines for the two gate folders, so a prompt appears every time. The integrator waited 68 minutes across four prompts on 9/30 alone.
	- [ ] Restart the BTO pane on Netcup: exit that Claude session and start a new one in the same folder. It picks up 0.20.18 with the delete guard and the new integrator, and the prompts stop. (recommended)
	- [ ] Remove "Bash(rm -rf *)" from the ask list in the Netcup user settings, keeping the session as is. Deletes under the project allow lines then run without a prompt, and any other rm -rf in any project on that box runs unprompted too.
	- [ ] Both
	No default: the prompts continue until you tick
	<empty-block/>
</details>
