<details>
<summary>**The narrowed secret guard is already live on Windows: keep it, or revert until its selftest passes there?**</summary>
	Lane 60 merged tonight: the guard now logs every refusal with redaction, has an off switch, and stops refusing the harmless shapes your desktop corpus showed (59 of 362 past refusals now pass, 0 regressions, 0 real reads let through). Opus red-teamed it three rounds and approved. skills-n applied it on Hetzner, selftest 74 of 74, and left Windows and Mac for your word. But at 11:01 PM NY a full chezmoi apply ran on the Windows box, one I did not run and cannot attribute, and the new guard has been live in every Windows session since. Update 9/30 10:24 AM NY: the selftest was made portable this morning (test-only change, no install) and now passes on this Windows box against the live installed guard: 73 passed, 0 failed, 1 file-mode check skipped because Windows has no such modes. I ran it myself and it exited clean. So the guard that has been live here since last night is now tested here. Reverting would mean overwriting a chezmoi-managed file that the next apply flips back.
	- [ ] Keep it on Windows, apply on Mac when it answers (recommended)
	- [ ] Revert Windows to the previous guard
	- [ ] Hold: keep Windows as it is now, decide on Mac later
	No default: Windows keeps the new guard because it is already applied, Mac gets nothing
	<empty-block/>
</details>
