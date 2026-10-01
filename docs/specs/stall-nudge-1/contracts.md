# Lane 30 lead rulings (skills-n)

S1 Where the default of 2 lives. The spec puts `--stale-hours 2` in the timer unit's ExecStart. `install-janitor-timer.mjs` is outside the territory, so the builder does not touch it. After the merge the lead edits the live Netcup unit by hand: append `--stale-hours 2` to ExecStart, then daemon-reload. The collector's own built-in default stays 6. The known gap goes in the record: a reinstall regenerates the unit without the flag, and the follow-up is to add `--stale-hours` passthrough to the installer.

S2 Dedupe. Before sending, read every `docs/ledger/*.md` file in the `--recipient-repo` the collector already passes to note-send. The ledger there is the one note-send writes for the collector. Do the read in-process, never through a shell. Search for the literal id prefix `[<collector-slug>-stall-<branch-slug>-<tipSha7>-`. Any hit means this tip was already asked, so send nothing. branch-slug is the branch name lowercased, with every run of characters outside [a-z0-9] replaced by `-` and the ends trimmed. The whole topic must pass note-send's topic grammar; if it is too long, truncate the branch-slug part, never the sha. A ledger read error means no ASK this run, with one stderr line (fail closed on noise, not open).

S3 Recipient. The row's record `Owner:` field. If it is `none`, missing, or fails note-send's slug grammar, send no ASK, print one stderr line, and leave the attention row unchanged.

S4 Kill switch. `~/.agents/collect/<basename of --repo>/no-nudge`, the same directory as status.json (K1). The home stays injectable for tests.

S5 Order. The ASK goes after status.md and the existing RESULT, one note-send spawn per row, with the same argv shape as buildNoteArgv plus `--needs review --by <HH:MM of now+30m, America/New_York>`. Match note-send's `--by` grammar. A note-send failure is logged and never fails the run.

S6 The builder does not do the live proof. The lead runs it by hand from a main checkout after the merge.
