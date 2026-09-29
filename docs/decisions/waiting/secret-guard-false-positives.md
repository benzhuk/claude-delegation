<details>
<summary>**Secret guard: 236 refusals on this desktop, most of them read-only greps**</summary>
	The secret guard is doing its job on real secret paths, but it also refuses ordinary read-only commands whose text merely resembles one: today it stopped skills-a mid-scout on a grep for argv, and it keeps no log of what it refused, so nobody sees the cost. Count on this desktop: 236 refusals across 108 transcripts. Each one stalls a lane until a lead rewords the command. Proposed: a narrow lane that adds a denial log (command text only, never file contents), then tightens the two noisiest patterns against that log, with a red-team review so nothing real gets through. The guard stays on throughout.
	- [ ] Yes, open the guard lane after the sweep (recommended)
	- [ ] Hold, live with the refusals
	No default: the guard stays as it is until you tick
	<empty-block/>
</details>
