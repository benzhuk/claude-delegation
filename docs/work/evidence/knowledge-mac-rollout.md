VERDICT: PASS — approved triage/learn content is deployed on Mac; the earlier raw-hash mismatch was line-ending normalization, not a source-content mismatch.

Discriminating Git-object check on Windows:
- triage: candidate hashed with `git hash-object --path=dot_claude/skills/triage/SKILL.md` = commit 342ce95 blob bd3524f14cb9f38229042d3fd22ab9af23f8121b.
- learn: candidate similarly = commit blob 5c68fe984f64e897221f457492e7cd0b08a33339.
Thus the final candidate bytes are exactly the committed content under Git's EOL rules.

Deployment receipt:
- Scoped bundle from Mac base 859e412 to Windows main 342ce95 verified, transferred using strict existing SSH, fetched locally, and fast-forward merged. Mac source is clean at 342ce95.
- Exact targeted nonforce chezmoi apply used --error-on-conflict --less-interactive --exclude scripts with absolute source paths.
- Durable cache 0.20.4 mirror dry-run and apply both exited 0, no refusals; mirror entries were up to date.
- Mac LF live and mirror hashes agree: triage 498b3a645bc806c0fa27fd40ee1a03796cbc75801990da101b866f96e659e5fc; learn df7602846b5c7b1990bd425ddc1b40dc1b1ab1d0c4d3e8a3e3f8bcd2468ef656. They differ from Windows raw candidate hashes only because Git normalized mixed/CRLF working bytes to LF on Mac.
- Protected INDEX and cross-machine-recovery hashes remained exact afc5af6b5d5f5206a064a82e26cc1555c8d5b8940bebb286903f608bdf3878b2 and dc9b0693ea61b4362d2a06a47cf40423c8ad8670ba60891f0f49c890cdead235.

Future transport observation: Mac `gh auth status` reports its active GitHub token invalid and strict `ssh -T git@github.com` reports publickey denied. Neither was changed. The verified scoped-bundle strict-SSH route remains the supported credential-free path.
