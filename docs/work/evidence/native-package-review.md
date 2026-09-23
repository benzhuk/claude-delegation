VERDICT: APPROVE 24667ebb251a11fc3cc3dad462002dbcd34641f8

Independent native-package review against base 49c1b64. Reviewed exact diff, specification, builder report, package contract, existing sealed-home helper, and available coexistence report. No source or real-home mutation, provider/model call, hook trust/execution, subagent, or full suite. No blocking findings or required fixes.

Direct native evidence

I authored and ran native-package-review-probe.mjs using this checkout's makeTempHome({gitIdentity:false}), a full disposable package copy, and disposable CODEX_HOME. Local CLI reports codex-cli 0.156.1. I deliberately named the package copy arbitrary-checkout-name and ran the commands from its parent directory, avoiding the builder's matching directory name and package cwd assumptions.

- plugin marketplace add <copy> --json: exit 0, marketplace delegation resolves to the arbitrary checkout root.
- plugin add delegation@delegation --json: exit 0, version 0.17.1, installedPath under disposable .codex/plugins/cache/delegation/delegation/0.17.1.
- plugin list --json: exit 0, installed/enabled true, local source is the actual copied repository root, installation AVAILABLE and authentication ON_INSTALL.
- Cache inspection: root manifest, both hook JSON files, and all nine SKILL.md files are byte-identical to their copied sources. Cache location is inside the disposable home.
- debug prompt-input: exit 0. Actual catalog entries, not incidental substring matches, expose delegation:bearings, delegation:continue, delegation:decisions, delegation:delegate, delegation:dev-server, delegation:janitor, delegation:multi, delegation:notion-writing, and delegation:team-build. Each points to r2/<skill>/SKILL.md, where r2 is this versioned plugin cache's skills directory.
- Read-only app-server hooks/list: a valid result for the probe cwd, hooks [], warnings [], errors []. No hook was trusted or run.

Artifacts, local only:
C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923/native-package-review-probe.mjs
C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923/native-package-review-probe.json
C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923/native-package-review-prompt.txt

Important isolation limit: despite redirected HOME/USERPROFILE/AGENTS_HOME/CODEX_HOME, the Windows native CLI also reads real C:/Users/benzh/.agents/skills into r0. This is independently visible in my prompt capture and agrees with native-coexistence.md. The package discovery conclusion remains attributable to the distinct plugin-namespaced r2 entries, but this is NOT a completely isolated OS-home read or personal-skill precedence proof. Installation/config/cache writes were disposable; no real configuration changed. Raw prompt artifacts contain unrelated personal skill descriptions and should remain local.

Hook boundary and Claude preservation

plugin.json:7-8 explicitly selects ./hooks/codex-hooks.json under extensions.com.openai; hooks/codex-hooks.json:2 is an empty hooks object. Native enumeration independently verifies the actual result is zero hooks, even though the cached package still contains the original Claude hooks/hooks.json. The coexistence lane's separate compatibility control enumerated eleven untrusted Claude hooks; I did not repeat its fixture or infer hook execution from enumeration. Its report appropriately avoids claiming that a comparison changing both manifest form and override proves the override alone causally.

The source diff contains no existing Claude hook/manifests changes. Independently compared Git blobs for hooks/hooks.json at base and candidate: both bf61bc26083bd3989b7bd6072dce6e84157a0544. Root portable ingestion on this CLI is proven, so a duplicate .codex-plugin manifest is not required merely to satisfy the older validator. Actual Claude runtime ingestion or execution was not exercised; byte preservation is narrower evidence.

Coverage, frontmatter, and version

Independent PyYAML parsing passed for all nine skills. Compared bodies after frontmatter for dev-server and janitor to the base: both unchanged. Their only changes are folded YAML description scalars (skills/dev-server/SKILL.md:3-4 and skills/janitor/SKILL.md:3-4), and actual CLI catalog descriptions retain the intended text. No skill was excluded to obtain ingestion success.

Root plugin.json:4 and .claude-plugin/plugin.json:5 both declare 0.17.1, consistent with the unchanged Claude marketplace version. Native installed/listed version is also 0.17.1. The native catalog intentionally carries no independent version field. Marketplace local ./ resolves to the repository root, not .agents/plugins, as verified from a different cwd and differently named root.

Claims and limits

codex/README.md:53-60 accurately describes native skill discovery and the empty native hooks boundary without claiming native role loading, lifecycle hook activation, or peer delivery. Lines 62-64 keep the mirror a separate integration and explicitly avoid automatic dual installation. Lines 66-69 explain the legacy validator mismatch rather than adding another manifest. These claims fit observed behavior.

The separate coexistence report was available and read. It does not establish duplicate-free coexistence or which same-named personal skill should win. My capture shows personal and plugin-namespaced variants simultaneously, but that does not establish execution precedence. No source claim needs that stronger conclusion, and I recommend no change to working mirrored delivery based on this discovery-only evidence.

Nonblocking pre-existing documentation detail: codex/README.md:32 lists only six mirrored skills; the current mirror inventory also includes bearings and continue. Correct that inventory when updating installation documentation. It does not undermine the newly added native nine-skill discovery section or the actual native package.

Scope of approval

Approved for this source artifact's native local package discovery, correct marketplace/cache resolution, full nine-skill ingestion, and explicit suppression of Claude hooks in Codex. This is not approval or proof of persistent installation, complete OS-home isolation, trusted hook activation, custom role loading, mixed-host collaboration, or duplicate-free mirror/native coexistence. Parent remains responsible for release version changes and integration gates.
