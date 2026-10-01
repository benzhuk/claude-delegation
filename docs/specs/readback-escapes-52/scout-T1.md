## Files and symbols
- `C:/Users/benzh/orca/workspaces/claude-delegation/codex-followups-49/skills/decisions/scripts/decisions-render-core.mjs` exists at `bb77a1d`; `normalize(text)` is lines 36-76.
- Its comment at lines 28-33 pins CRLF, trailing whitespace, blank-run, structural `</details>` separator, and one trailing `<empty-block/>` as the only existing equivalences.
- The premise holds: `normalize` is exported at line 36 and remains a string-returning pure function (line 75).
- `decisions-render-publish.mjs:482-484` uses it for step-3 drift; `:562-573` uses it for step-6 readback verification. `decisions-render.mjs:25-45` imports/re-exports it for renderer tests.

## Helpers to reuse
- Extend `normalize` itself in `skills/decisions/scripts/decisions-render-core.mjs:36-76`; no second comparator exists.
- Preserve its existing fence/details state handling at `:41-74`, which keeps structural blank normalization out of fenced literals.

## Tests that police this area
- `skills/decisions/scripts/decisions-render.test.mjs:104-210` directly constrains `normalize`, including content inequality, raw fixture SHA-256 checks, separator equivalence, removed bullet/tick/moved-line negatives, and fenced literals.
- `skills/decisions/scripts/decisions-render-publish.test.mjs:225-244` requires normalized-equal fresh/last render to pass drift; `:726-740` requires nonmatching readback to exit 5.
- `skills/decisions/scripts/decisions-render-core.test.mjs:37-57` only protects `defaultExecGit`; it does not cover `normalize`.

## Open questions for the spec
- The supplied raw snapshots also differ in `- [ ] Done` versus `- [ ] Done (last cleared: Sep 28, 2026, 5:50 PM America/New_York)` and in two structural blank separators. With the stated escape-only change, how can a verbatim two-snapshot equality assertion pass without also accepting the timestamp difference?
- The recorded escaped-character set is unresolved until the authorized scratch probe. Which captured characters and context boundaries must normalization apply to?
