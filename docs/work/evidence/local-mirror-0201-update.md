VERDICT: PASS current Windows plain shared-skill update

September 23, 2026, 11:18 PM America/New_York. Durable main `7f2f0c9` / version 0.20.1 was applied through the existing plain mirror updater under Ben's local skill-update instruction. Managed skills, shared docs and manifest were backed up at `C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923/mirror-0201-update/backup` before applying.

The update copied `docs/subagent-contract.md` to the shared `_docs` directory and refreshed manifest metadata. All eight plugin SKILL.md files match source. The manifest identifies version 0.20.1 and the durable main source path; a second dry-run reports no pending changes. Current and default Codex homes' config.toml and hooks.json hashes are unchanged. Apply and verification JSON are retained beside the backup.

The changed shared contract requires actual native process exits and retained output for passing gate claims; an empty tool wrapper or later successful commit is not evidence. This corrects the observed false passing report. It does not guarantee every agent will comply or install/trust new native hooks. Broader native rollout, Windows SDK shell qualification and other-machine updates remain separate.
