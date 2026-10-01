# Lane 60 lead ruling r3: the phase 2 delta red-team (p2-review-r2.md)

Input: p2-review-r2.md, NEEDS_FIXES (1) on 12589fc2ad12f48eb213981dc42044d9ab6be110. The finding is N2, HIGH: `git log -L` and `-L:func:` print a secret file's lines across history. The git-flag handling is a denylist, which is how -L slipped through.

Adopted, taking the reviewer's deeper recommendation over its minimal patch:

- **git log and git diff flags become a positive allowlist.** A `git log` or `git diff` whose operand is a secret file keeps the exemption only when EVERY flag it carries is on this list:
  - --stat, --shortstat, --numstat
  - --name-only, --name-status
  - --oneline, --graph, --decorate, --no-decorate, --abbrev-commit, --no-merges, --merges, --reverse, --all, --follow
  - -n N, -N, --max-count=N, --skip=N
  - --since=, --until=, --after=, --before=, --author=, --committer=
  - --date=, --format=, --pretty=
  - `--`
  Any other flag, including a combined short-flag cluster, means no exemption, and the path is scanned as at c890801. When unsure, deny.
- **--format and --pretty are allowed only with a value that contains no %-placeholder that prints content.** Log placeholders print commit metadata, not file bytes, so they are safe. If doubt remains, drop them from the list.
- **git show stays never-exempt**, as ruling r2 already says.
- **The selftest gets new cases.** Each must be red on 12589fc and green after:
  - `git log -L<range>:<secret>` and `git log -L:func:<secret>`;
  - one unlisted flag, for example -W;
  - a combined short-flag cluster.
  Keep allowed: `git log --stat -- <secret>`, `git log --oneline -n 5 -- <secret>`, `git diff --stat <secret>`.
- **Measure.** Re-run the full-length replay against c890801. It must show 0 regressions and 0 real reads. Report the new now-passing count and the allow-path cost. The cost stays under the 60 ms budget, and the reviewer measured 41 to 42 ms at 12589fc.
