VERDICT: APPLEDOUBLE NOT A LAUNCH BLOCKER

# Lane 40 readiness addendum: AppleDouble publication scope

Observed against the installed triage skill at SHA256 `f9924f92c15db1264610bb87df11fbf18595d749d8280324b9bc1007e8c06ec9` and the existing path-only `dotfiles-dirty-manifest.json`. No AppleDouble file content was read, and nothing was cleaned, staged or mutated.

The maintained publisher contract excludes all 48 `._*` files:

- Skill lines 92–97 allow only changed `INDEX.md`, root topic `.md` files, and `_inbox/_archive/DIGEST.md`. They require **exact-file** `chezmoi add --secrets error`, require the staged set to equal that explicit allowlist, and forbid raw inbox notes, other archive files and unrelated paths.
- Skill lines 99–101 require an empty pre-existing staged set and prohibit unstaging or altering unrelated staged work.
- The instructions contain no wildcard or directory staging command. The publisher is the skill-guided child, so these requirements are the maintained staging contract.

Every one of the 48 knowledge-tree AppleDouble paths is a distinct path outside that allowlist. Examples make the separation mechanical: `._INDEX.md` differs from `INDEX.md`, `._ai-sdk.md` differs from `ai-sdk.md`, `._DIGEST.md` differs from `DIGEST.md`, and all `._<archived-note>.md` files are other archive files expressly forbidden from publication. The manifest records all 48 as untracked, unstaged, with no index entry. All are 163 bytes with SHA256 `d92800db7e68fb4f3746c2dc7752c73413f930f6d23998f6f25d8d50a3be5a48`.

Recommendation: allow these 48 paths as pre-existing unrelated dirt; do not create a cleanup prerequisite. The immediately-before and after snapshots must prove preservation for the exact set: each path remains untracked, absent from the index and commit, and retains its type, 163-byte size and SHA256. The same preservation rule continues to cover the 80 AppleDouble paths outside the knowledge tree and the unrelated modified `dot_claude/hooks/executable_distill-session.sh`.

This addendum supersedes only readiness-report.md blocker 2. It does not make the live proof ready: independent review currently reports NEEDS_FIXES, source/test fix work is running, root approval is absent, and a fresh immediately-before baseline remains mandatory. No live run was performed.
