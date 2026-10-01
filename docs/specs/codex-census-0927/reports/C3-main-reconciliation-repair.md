# C3 main reconciliation repair

Reviewed candidate: `f5d2c18626692d148741550499edb7b63e27a63f`

Repair source: `d0529b55e833f08de0fdb5dd92266562c9d01970`

## Finding reproduced

The native response companion preserved a valid lead-only count when whole-build token
coverage was partial, but it inferred permission from the token-coverage failure itself.
That allowed the response count through when `Opened:` or an accepted log was missing, or
when the native census belonged to a different build window.

## Repair

`buildFourRead` now computes an independent native build-window result from the parsed
record window and the census start/end, using the established five-minute tolerance and
last-acceptance bound. The native companion requires that result, lead identity, and the
C1 timeline to be valid before reporting a response count. Token completeness remains a
separate dimension: a valid build window with child-only incomplete coverage keeps the
lead-only response count and labels its tokens unavailable.

The fix does not read a raw Codex rollout, change Claude R6/R7 behavior, or modify
`work-record.mjs`.

## Regression coverage prepared

The native companion regression crosses complete and child-partial token coverage with:

- missing `Opened:`;
- missing acceptance;
- a record whose first log is acceptance; and
- a census/timeline outside the record's build window.

Every invalid-window combination requires an unavailable companion and forbids a verified
native response count. Existing positive assertions retain the two-response count for a
valid child-partial census and for a valid build whose spec slice is unavailable.

Per assignment, no test command or gate was run in this repair lane. The integrator owns
execution gates.
