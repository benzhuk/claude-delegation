VERDICT: PASS

Work: wr-2026-09-28-readback-escapes
Source: `skills/decisions/scripts/decisions-render-core.mjs`
Base: `bb77a1d97f8dae420917bcaa3e82385451db0662`
Source SHA-1: `26c586276ce525221ae69167ebf833116eafc9b1`

Changed behavior: `normalize(text)` now treats exactly one backslash immediately before `*`, `[`, `]`, backtick, `~`, `>`, `|`, or `<` as insignificant. It retains the character and leaves all other backslashes untouched. The existing line, blank-run, structural-details, and trailing-marker normalization is unchanged.

Cause: Notion's observed markdown readback adds one backslash before exactly the eight probe-recorded punctuation characters, making semantically unchanged text fail the shared drift/readback comparator.

Discriminating check: A direct source check verified all eight observed inputs normalize to their bare-character form, each of `_`, `#`, `-`, `+`, and `!` remains unequal when backslash-prefixed, and `A\\*B` normalizes once to `A\*B` rather than dropping both backslashes. The latter is the concrete consecutive-backslash boundary; no widening was made for it. The literal correction smoke check preserves `\*` and `\[` differences in backtick and tilde fences, matching single- and multi-backtick code spans, and matching multiline code spans; it retains prose equivalence for `\*` and escaped prose backticks, and does not let an unmatched tick suppress later prose equivalence.

Fix location: `skills/decisions/scripts/decisions-render-core.mjs`, in the existing `normalize()` loop. It reuses fence state and adds private exact-run inline-span state/lookahead before the existing structural fence/details logic.

Simplification: The one comparator remains. The private scanner has no public API or dependency: it copies fenced and matched inline literal regions, and applies the same eight-character replacement only to remaining prose. No wildcard semantics, generic Markdown character class, timestamp rule, or caller change was added.

Literal-region correction and limits: The initial source revision applied the rule inside fences and inline code; independent review demonstrated the false green and root's correction requires literal preservation. A matching backtick run may span ordinary lines only until an existing fence-boundary line; unmatched openers stay prose. The raw probe covers a one-paragraph prose context only, so this bounded literal protection does not assert a Notion escape equivalence for multiline or literal code. Structural-looking escaped brackets/quotes and multiple-backslash roundtrips remain unprobed and are intentionally not broadened.

Literal-region smoke gate:

```text
$ node -e '<direct normalize smoke cases>'
literal-region smoke: pass
```

Scoped native exit: `0`.

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
