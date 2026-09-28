NEEDS_FIXES 4d6c940
VERDICT: NEEDS_FIXES 4d6c940849f4c48264e0f05071bfd2b667e745c3

Reviewer: lane48-review (Claude Opus 5.5, claude-opus-5-5), subagent of skills-fable team lead.
Inspected artifact: detached worktree at 4d6c940 (merge-base with origin/main 926c6f8). Code commit 8c0af56; 4d6c940 is docs-only on top.

## Summary

The normalise change itself is sound: narrow, pinned to the one observed position, applied on both sides, and it hides no content change I could construct. The candidate still fails its own focused gate on any fresh checkout, because the committed fixtures are not the bytes the in-test SHA-256 pins. That is one MAJOR with a mechanical fix.

## Findings

### MAJOR 1: fixture hash pins CRLF bytes, git commits LF bytes; the render test file crashes on every fresh checkout
- Evidence: `.gitattributes:2` is `* text=auto eol=lf`. The scout originals in the gate dir (`C:/Users/benzh/orca/gates/01a0df4c-.../render-readback-48/main-merge-r2-*.md`) are CRLF (6906 / 6904 bytes, hashes 535914... / 5E38CB...). The committed blobs are LF (6849 / 6848 bytes, sha256 7285214582... / 0becbfd2...). `git cat-file -p HEAD:<fixture> | sha256sum` = 7285214582..., confirming the blob, not just my checkout.
- Effect: `lane48Snapshot` asserts at module top level (`skills/decisions/scripts/decisions-render.test.mjs:140`, called at :143), so the whole `decisions-render.test.mjs` file dies before registering any test. My run of the brief's focused gate on a clean worktree: exit 1, `tests 49 / pass 48 / fail 1` (the one failure is the file crash; the ~96 render tests never run). The lane's 145/145 was produced in the builder's working tree where the CRLF copies were never re-checked-out. Netcup/Linux second-host verification will fail identically.
- Cause: fixtures written CRLF on Windows, normalised to LF by git on commit; hashes pinned from pre-commit bytes.
- Discriminating check: `git worktree add <tmp> 4d6c940 --detach && node --test skills/decisions/scripts/decisions-render.test.mjs` exits 1 with `actual 7285214582...  expected 535914342B...`.
- Fix location (choose one; A preserves "exact original bytes", which the review brief requires):
  - A. Mark the fixtures binary and recommit the original CRLF bytes. Patch `.gitattributes`, after the `*.png binary` line:
    - old: `*.png binary`
    - new:
      ```
      *.png binary
      # Lane 48 byte-pinned Notion snapshots: keep original CRLF bytes, hashes are asserted in-test.
      skills/decisions/scripts/fixtures/render-readback-48/*.md -text
      ```
    - Then copy the two originals from the gate dir over the fixture paths, `git add` them (git will now store CRLF), and confirm `sha256sum` equals the pinned values in a fresh worktree.
  - B. Repin to the committed LF bytes at `decisions-render.test.mjs` lines with the hash strings:
    - old: `'535914342B07C360AB2FBC59699598C2012F547C3C7F501FCC5CC8EC8D755E1E'` new: `'7285214582D93D6AAB73B5323C967A058598D481A7E315E7A5F30780CE6CD277'`
    - old: `'5E38CB6460AC8B4C7255E785716ED664A4C028DD3CB3C5A74A8EDFB90BBE6DB1'` new: `'0BECBFD2E743FF5190390E83F4BC61B378B9F3BF5F211D44EE4A8935CBF462B0'`
    - and update the scout/test-report hashes with a note that fixtures are the LF-normalised originals. This loses the CRLF coverage path, so A is preferred.
- Simplification: the in-test hash is valuable (it caught this); keep it, fix the bytes.

### MINOR 2: record Artifact field names 8c0af56, not 4d6c940
- `docs/work/wr-2026-09-28-render-readback.record.md:6` reads `Artifact: 8c0af5601f60b54bcd74fc52a7cdb65916203b70`. The artifact under review is 4d6c940 (and, after the MAJOR fix, a new sha). The root owns the record; update Artifact to the fixed candidate's sha when it lands. Reviewer does not edit docs/work.

### NIT 3: comment slightly overstates the fence guard
- `decisions-render-core.mjs:28-32` says the details exception "never applies inside a fenced literal". True for the cases tested, but a fenced block that is never closed disables the exception for the rest of the page (safe direction: under-normalises, could re-cause exit 5 on a malformed page, never hides content). No patch needed; optional wording: "an unclosed fence disables the exception for the remainder of the page".

## Attack results (priority 1, over-normalisation)

Probe script ran new `normalize` and the base (926c6f8) `normalize` on each pair; "unequal" means the verifier still fails, as it should.

| Case | new | base |
|---|---|---|
| Pinned pair (committed LF bytes) | EQUAL | unequal (red for the right reason) |
| Blank line between two items inside a toggle | unequal | unequal |
| Internal whitespace inside a fenced block | unequal | unequal |
| Trailing space inside a fenced line | EQUAL | EQUAL (pre-existing spec rule, not this lane) |
| Tick `[ ]` vs `[x]` | unequal | unequal |
| `<empty-block/>` removed mid-page | unequal | unequal |
| Two bullets merged | unequal | unequal |
| Blank after `</details>` inside an unclosed fence | unequal | unequal |
| Blank after `</callout>` | unequal | unequal |
| Blank after indented nested `\t</details>` | unequal | unequal |
| Blank after stray `</details>` with no opener | unequal | unequal |
| Blank after structural `</details>` then fence containing literal `</details>` + blank | unequal | n/a |
| Blank between structural `</details>` and `<empty-block/>` | EQUAL | n/a (blank line only; marker kept, acceptable) |

The lane's own tests cover removed bullet, changed tick, moved line, backtick, tilde, longer-fence and suffixed-delimiter literals (test file lines ~157-205), so the "fenced literals remain unequal" claim is test-backed.

## Priority 2: pinned vs guessed
Byte diff of the two originals: exactly one difference, the blank line after the first `</details>` (before `<details>` Release 0.20.18). No final-newline difference (both end `<empty-block/>` + newline) and no callout difference. The rule targets only a blank following an unindented `</details>` closing an unindented `<details>` outside a fence: exactly the observed class, not "all blanks". No callout rule was added. Good.

## Priority 3-5
- Red-then-green: verified directly with base `normalize` on the pinned pair (unequal). The lane's red log shows 143/144 with 1 failure; it could not be re-run from a clean checkout because of MAJOR 1.
- Both sides: every comparison goes through the single exported `normalize` (`decisions-render-publish.mjs:483-492, 552, 571`, `decisions-handback.mjs:493`). No one-sided fix.
- Territory: `git diff 926c6f8..4d6c940 --stat` touches only `decisions-render-core.mjs` (normalise + its comment), `decisions-render.test.mjs`, two fixtures, `docs/specs/render-readback-48/*`, the work record. Nothing in pickup, composition, title/autolink guards, `--adopt-live`, or notion.js. No census line.

## Priority 6-7
- Spec-from reads `2026-09-28T23:12:00Z` with the correction noted at record line 49. Reviewed Log line absent, as expected.
- Tests: `node --test skills/decisions/scripts/decisions-render.test.mjs skills/decisions/scripts/decisions-render-publish.test.mjs` on the clean worktree: exit 1, 49 tests, 48 pass, 1 fail (file crash on the hash assert). Claimed 145/145 not reproducible from the committed tree. Raw log: `SCRATCH/l48-tests.log`.

## Verified directly vs taken from the brief
- Directly: diff/territory, normalize code read, both-sides call sites, snapshot byte diff, CRLF/LF hash mismatch, red on base, all probe cases, focused test run.
- From the brief/record: that the snapshots are the true fresh-read and pre-write render from the incident; the three prior `--adopt-live` recoveries; the lane's 145/145 raw logs (read, not reproduced).

Worktree left in place at SCRATCH/wt-review-48 per instructions.
