# The decisions page shape

The rule and the owner's reason for it are stated once, in `SKILL.md` under "Page shape". This
file is the detail a session needs when it adds, moves or checks a section. The renderer
(`scripts/decisions-render.mjs render`) is the only writer of this shape; nothing here is a fill-in
template, and a hand edit is overwritten by the next publish.

## Top level: toggles only

Every top-level block is a toggle (`# Name {toggle="true"}`, children tab-indented, the last child a
tab-indented `<empty-block/>`). A loose paragraph, bullet, callout, checkbox or table at the top
level fails page-lint's `top-level-toggle` rule, and the renderer runs that rule, so the page does
not publish.

| Order | Toggle | Owner of its text | Source |
| --- | --- | --- | --- |
| 1 | Goal card | agent, regenerated every publish | `docs/goals/card.md`, first child line `main at <sha>` |
| 2 | Bearings | agent, regenerated every publish | newest `docs/work/evidence/<date>-bearings-assessment.md` and `-response.md` |
| 3 | Components | agent, regenerated every publish | `docs/components.md` |
| 4 | Waiting on you now | agent items, owner answers | `docs/decisions/waiting/*.md`, `now.md`, `session.md` |
| 5 | History | agent | `docs/decisions/history/*.md`, `docs/decisions/archive/*.md` |

The top level stays this short on purpose. A new kind of content goes inside one of these toggles,
or becomes a new toggle only when the owner names a thing he looks for that is not here.

## Inside each toggle

- **Goal card**: `main at <sha>` first (the same sha the Goals page prints; the hand-back compares
  it to the head), then the card's lines, whole. A bare file path in the card is wrapped in
  backticks so Notion does not autolink it.
- **Bearings**: Decision (the verdict word and the date), Condition (only when the assessment
  states one), Next action, Prediction with its check date, and links to the Goals page and to both
  files on GitHub main. A field that cannot be found refuses the render; none is invented.
- **Components**: one line per component, `name (state): what it does for the goal`. State is one of
  fed, measured, unfed, partial, missing, defined in the header comment of `docs/components.md`.
- **Waiting on you now**: the waiting items first (each a `<details>` toggle with options), then
  `What is going on`, then `This session`, then the comment callout, and last the Done checkbox,
  then the toggle's empty block. Done is the last block the owner reads inside the toggle.
- **History**: one bullet per day, newest first, then the archive bullet.

Detail nests inside: an item's evidence and options live under its own `<details>`; nothing is
promoted to the top level to make it easier to find, because the top-level names are the finding aid.

## Done

`- [ ] Done` (after a clear: `- [ ] Done (last cleared: <timestamp>)`) is the last block inside
`Waiting on you now`. `decisions-read.mjs` accepts it there with no warning, warns `Done is not the
last line` if another block follows it inside that toggle, and still reads a legacy column-zero Done
at the end of an older page. `publish` unticks it in place under `--clear-done`, keeping its tab.

## Changing the shape

Change the renderer (`decisions-render-core.mjs`, `decisions-render-sections.mjs`), its fixtures and
this file in one lane. Page-lint's `done-last` and `top-level-toggle` rules and the tests in
`decisions-render.test.mjs` and `page-lint.test.mjs` fail when the page and the rule disagree.
