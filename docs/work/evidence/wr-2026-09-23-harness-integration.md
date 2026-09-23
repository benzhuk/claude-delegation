VERDICT: PASS — tested release candidate `0c452132d8a22a59cf424a3ab7cae8f05b3f6722`; documentation successor `9d9df6e33a338982d0feac834ab0a9efc85aedd3`; record-layout successor `215e90d59e749fcb0ebbd68bea99cd98a0a2694d`

# 0.14.0 local release candidate gate

## Source proof

- Metadata versions: `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` both declare `0.14.0`.
- README lists callable `/delegation:bearings`; its usage states the evidence-bounded `CONTINUE` / `RE-PLAN` / `CUT` outcome and that an attended decisions/goals render uses the existing writer.
- README and changelog explicitly state that automatic daily triggering and unattended `Done` pickup are not included.
- Tested candidate commit: `0c452132d8a22a59cf424a3ab7cae8f05b3f6722` (`release: prepare 0.14.0 candidate`).
- Documentation successor: `9d9df6e33a338982d0feac834ab0a9efc85aedd3` documents the verified copied-layout route to the installed plugin/repository helper, preserving project cwd and `--repo`; it changes no production behavior.
- Current HEAD: `215e90d59e749fcb0ebbd68bea99cd98a0a2694d` repairs record layout only. Since the full-suite candidate, HEAD contains documentation and record changes only.

## Gate results

- `node scripts/run-tests.mjs` at exact commit `0c452132d8a22a59cf424a3ab7cae8f05b3f6722`: 1,266 tests, 1,266 pass, 0 fail (40,269.2158 ms). Log: `C:/Users/benzh/AppData/Local/Temp/astra-build-0923/integration-gate.log`.
- `git diff --check`: pass at the tested candidate; no whitespace errors.
- `node scripts/work-census.mjs docs/work`: after the record-layout repair at `215e90d59e749fcb0ebbd68bea99cd98a0a2694d`, the final census parses and validates all five current-wave records cleanly. Existing timestamps and log order were preserved.
- `node --test skills/decisions/scripts/skill-text.test.mjs` at documentation successor `9d9df6e33a338982d0feac834ab0a9efc85aedd3`: 10 tests, 10 pass, 0 fail. No full suite was run or claimed for this successor.

## Work state from records

| current wave (reviewed, unreleased) | elapsed | accepted |
|---|---:|---|
| wr-2026-09-23-harness-a | 8.4m to reviewed | none |
| wr-2026-09-23-harness-bc | 18.6m to reviewed | none |
| wr-2026-09-23-harness-d | 8.4m to reviewed | none |
| wr-2026-09-23-harness-e | 15.3m to reviewed | none |
| wr-2026-09-23-harness-g | 18.6m to reviewed | none |

Current wave: 5 reviewed and unreleased, all with no acceptance recorded. Historical pending records: 8 (7 runnable, 1 delivered); these are separate from the current wave. Token counts and seven-day rework are unknown: the records state neither has been measured.

## Commands run

```powershell
node scripts/run-tests.mjs > C:/Users/benzh/AppData/Local/Temp/astra-build-0923/integration-gate.log 2>&1
git diff --check
node scripts/work-census.mjs docs/work
node --test skills/decisions/scripts/skill-text.test.mjs
```

## Scope of this verdict

This is source proof for a local candidate only. Live deployment gates were not run: no plugin installation or mirror write, CLI reinstall, main merge, push, live Notion publication, host-discovery verification, or two-host baseline verification occurred.
