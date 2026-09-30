<details>
<summary>**Cleanup: layout for the zhuk-infra folder**</summary>
	zhuk-infra is itself a git repo (benzhuk/zhuk-infra) at Code/zhuk-infra on all four machines, and claude-delegation is a separate repo beside it. Putting one repo inside another repo's checkout is the awkward option. The move waits until every pane is stopped, because seven Codex hook paths on Windows and the peer-note ledger point at the current claude-delegation path. On Windows, zhuk-infra's checkout sits on a feature branch 20 commits past main with one modified file and two untracked docs; that work is on origin but not merged.
	- [ ] Parent folder: Code/zhuk-infra/ becomes a plain folder holding the repos side by side: zhuk-infra (renamed infra), claude-delegation, and the orca fork on the Mac (recommended)
	- [ ] Same parent folder, plus move the dotfiles checkout in too. Chezmoi expects its fixed path, so this needs a chezmoi source-dir change on every machine.
	- [ ] Nest claude-delegation inside the existing zhuk-infra checkout and have zhuk-infra ignore it
	- [ ] Leave both where they are
	No default: nothing moves until you tick
	<empty-block/>
</details>
