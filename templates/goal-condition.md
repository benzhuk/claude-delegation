# Goal condition — for Claude Code's built-in `/goal`

`/goal` runs a small fast model after each turn to check one condition; if the
condition is not met, the session takes another full-context turn. A condition that
ignores blocked work makes a waiting session spin: a test session on 2026-09-20 took
11 turns to wait 83 seconds because its goal only checked whether work was finished,
never whether it was stuck.

The template:

```
/goal <work list is finished> OR every remaining item is recorded as blocked on a
named decision or a named peer ask, with its id
```

Notes:

- Keep the condition under 4,000 characters. The checker model reads it every turn.
- Set it at session start. A goal does not persist across sessions or restarts.
- This suits a small-context orchestrator that mostly dispatches and waits. It is
  expensive to run on a large context, because the check happens every turn.

## Example: a build orchestrator (synthetic)

```
/goal every territory's builder has reported GREEN and been merged, OR every
territory still open is recorded as blocked on a named decision or a named peer ask,
with its id
```

## Example: a research lead (synthetic)

```
/goal every research lane has a written finding, OR every lane still open is
recorded as blocked on a named decision or a named peer ask, with its id
```
