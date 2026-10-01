# Lane 59 lead ruling r3: seam delta review r2, adopted in full

Input: seam-review-r2.md, NEEDS_FIXES (5) on 483af6eeecdfcc92457dd975b239a7d3621d5605.

All five findings are adopted. Every patch applies verbatim where one is given. Ruling r1 still holds: doubt means do not remove.

- **Finding 2 (MEDIUM, private PID namespace).** Apply the reviewer's patch at janitor.mjs:1392-1394 verbatim.
  - Add a discriminating test that forces the namespace condition through an injectable seam. Use a stat or getuid injection, whichever the probe's existing test seams allow, rather than requiring `unshare` on the host.
  - If a real `unshare` test is added as well, it skips when `unshare` is unavailable, and says so.
- **Finding 1 (MEDIUM, win32 cwd check untested).** Add a discriminating test for the win32 path of MEDIUM 3 that runs on every host, through the probe's injectable seam. It must be red when the win32 check is reverted.
  - Correct the claim in seamfix-build.md by writing the corrected statement into your own report. Do not edit the old report.
- **Finding 3 (LOW, record race).** Use the reviewer's fix: an exclusive create (`wx`) with a retry on EEXIST, or whatever the finding specifies.
- **Finding 4 (LOW, predicate).** Add tests for the absolute-result clause (another drive, UNC) and fix the forward-slash win32 relative case as the finding specifies.
- **Finding 5 (LOW).** Replace the two private loose copies in reclaim.mjs with the shared predicate.
- **Out of scope, noted.** Do not change the integrator's `janitor --apply` without `--record` in SKILL.md:148-149. It is recorded as a follow-up.

**Gates.** Before reporting, both suites must be at 0 fail:
- Linux: `TMPDIR=/var/tmp node scripts/run-tests.mjs`.
- Windows: the bundle procedure in winfix-build.md.
