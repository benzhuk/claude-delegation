VERDICT: PASS

Work: wr-2026-09-28-readback-escapes
Source: `skills/decisions/scripts/decisions-render-core.mjs`
Base: `bb77a1d97f8dae420917bcaa3e82385451db0662`
Source SHA-1: `3c55daf619aea14861086706c2da1359df8c4104`

Changed behavior: `normalize(text)` now treats exactly one backslash immediately before `*`, `[`, `]`, backtick, `~`, `>`, `|`, or `<` as insignificant. It retains the character and leaves all other backslashes untouched. The existing line, blank-run, structural-details, and trailing-marker normalization is unchanged.

Cause: Notion's observed markdown readback adds one backslash before exactly the eight probe-recorded punctuation characters, making semantically unchanged text fail the shared drift/readback comparator.

Discriminating check: A direct source check verified all eight observed inputs normalize to their bare-character form, each of `_`, `#`, `-`, `+`, and `!` remains unequal when backslash-prefixed, and `A\\*B` normalizes once to `A\*B` rather than dropping both backslashes. The latter is the concrete consecutive-backslash boundary; no widening was made for it. Literal-code context was not separately probed, so the rule remains the specified single shared `normalize` transformation rather than a new context-specific comparator.

Fix location: `skills/decisions/scripts/decisions-render-core.mjs`, in the existing per-line normalization map before the existing structural fence/details logic.

Simplification: One replacement in the sole comparison function handles both comparison directions; no second comparator, wildcard semantics, generic Markdown character class, timestamp rule, or caller change was added.

Scoped gate:

```text
$ node --test --test-name-pattern="normalize:" skills/decisions/scripts/decisions-render.test.mjs
✔ normalize: CRLF becomes LF (1.1809ms)
✔ normalize: trailing whitespace is stripped per line (0.0816ms)
✔ normalize: runs of blank lines collapse to one (0.0965ms)
✔ normalize: exactly one trailing <empty-block/> is dropped (0.1261ms)
✔ normalize: a non-trailing <empty-block/> is left alone (0.0668ms)
✔ normalize: two texts differing only by CRLF/whitespace/blank-run/trailing-empty-block compare equal (0.0695ms)
✔ normalize: a real content change is never hidden (0.0776ms)
✔ normalize: Lane48 exact Notion readback differs only by the structural details separator (0.5926ms)
✔ normalize: Lane48 meaningful changes and fenced literals remain unequal (0.4961ms)
✔ normalize: Lane48 structural separator collapse is idempotent for an existing blank run (0.1836ms)
ℹ tests 10
ℹ suites 0
ℹ pass 10
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 72.0543
```

Scoped native exit: `0`.
