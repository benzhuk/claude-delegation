Status: delivered
Artifact: a742860b3ea8a35ffc19320d7958e3ec7ad71cf0
Scope: hooks/codex-unsupported.test.mjs only

Implemented functional/deadline clock separation with no production or census changes.
Focused final gate: `node --test hooks/codex-unsupported.test.mjs` — exit 0, 14 pass, 0 fail; raw/exit: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-clock-56/focused-008-final.raw.log` and `.exit.txt`.
Mutants: Stop-null and Stop-text-fallback each exit 1 with 13 pass, 1 fail, both targeting only `functional: real native Stop route surfaces backlog text for Codex`; receipts end in `-004.raw.log` and `.exit.txt` in the same gate directory.
No full suite run. The initial explicit-import attempt failed on Windows because Node requires a file URL; its retained receipt is `focused-001.raw.log` / `.exit.txt`.
