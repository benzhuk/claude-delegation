<details>
<summary>**Release 0.20.18**</summary>
	Main since 0.20.17 carries lane 46 (the plugin's test suites no longer leak temp directories; on 9/28 they had filled Netcup's temp space to 99.8 percent of its inodes, and every checkout still on 0.20.17 keeps leaking until this installs), lane 44 (a git environment inherited from a parent process can no longer rebind which project a note, pickup or collector acts on) and lane 38 (the census counts wakes, Stop-blocks and stall nudges for Claude and Codex leads alike). Lanes 36 and 37 are in flight and ride along if merged when your tick lands. Ticking yes to release means the release owner (skills-n) cuts it from main at that moment, reinstalls the Netcup collector timer and the Windows janitor task, installs on the four machines per this tick, and retries the Mac with this release.
	- [ ] Yes, release 0.20.18 now
	- [ ] Hold
	No default: installs take your word per item
	<empty-block/>
</details>
