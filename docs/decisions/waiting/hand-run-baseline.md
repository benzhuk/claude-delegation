<details>
<summary>**Hand-run baseline: the data is aging out**</summary>
	The DONE line needs the census to beat a hand-run build on all four measures. Today we record enough for plugin builds: work records carry ask, accepted and merged times, and the census reads tokens per build from transcripts. For past hand-run sessions only tokens and wall clock are recoverable; ask to accepted and rework need a person to mark the ask and the acceptance in three to five past builds, once. Two problems: transcripts are deleted after 30 days on every machine (this desktop now starts at 8/31), and each day erases more of the baseline. Proposed: raise the retention setting to 365 days on all four machines today, then a lane that picks five past hand-run builds, marks them with Opus adjudication, and stores the baseline file the census compares against.
	- [ ] Yes, raise retention now and open the baseline lane (recommended)
	- [ ] Raise retention only
	- [ ] Hold
	No default: transcripts keep expiring at 30 days
	<empty-block/>
</details>
