# Lane 57 lead ruling r2: review-r2 R1 to R3

Input: docs/specs/test-ipc-57/review-r2.md, NEEDS_FIXES (3) at 1135839. The review was static because /tmp was out of inodes. Its "Pending verification" section lists what still needs measuring.

- **R1: adopt the reviewer's patch.** The first pass judges each spawn call whole, including whether its env value is the parent process environment, undefined or null. The line-by-line pass skips the lines of calls the first pass already judged. Add a unit fixture: an env key set to the parent process environment on a line that begins inside a multi-line template string. It must be flagged.
- **R2: adopt the loud tripwire.** N2 fails, naming the file and line, when a call's extent does not close with `)` or spans more than 40 lines. It fails loud, never silent. Add a unit fixture for each: an unclosed call, and a regex literal containing `//`. If any real test file trips it, report the site. A real site gets fixed in the scanner, never exempted.
- **R3: adopt.** A bare `node` word counts only as a string literal argv element, never in a comment or an identifier.
- **F7 as built (exactly one declaration, else loud) is accepted.** It is stricter than ruled, and it errs loud.

Red and green: each new fixture fails at 1135839 (proved on a mktemp copy), and passes after.

Then run the review-r2 "Pending verification" steps yourself and report their output:
- the note-inbox.test.mjs:369 re-run with its env key removed must be flagged;
- the real per-file exemption counts;
- the three test files.

Gates: `node --test` on the three files, then `TMPDIR=/var/tmp node scripts/run-tests.mjs` once.

Territory is unchanged.
