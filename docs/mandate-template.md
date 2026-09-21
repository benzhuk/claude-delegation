# Mandate template

Fill in every bracket below and delete this line before sending. Every prompt to an
agent starts here, whether it goes to a builder, a reviewer, or a one-off researcher.

Task: <the exact question or task, one or two sentences, no ambiguity about done>

Inputs (by path):
- <path to the spec, contract, or prior finding this agent needs>
- <path to a second input, if any>

NOT (out of scope, stated explicitly):
- <a file, territory, or action this agent must not touch>
- <another one, if any>

Evidence format: <the shape you need to act without re-verifying, e.g. "cite file:line
for every claim", "measured numbers, not adjectives", "verdict word first">

Report: <path to the report file, ending in .md>. Line 1 is the verdict, first word.

A result of zero, "not found" or "could not determine" is a good answer. Say what you
tried. Do not guess.

Autonomy: <what this agent may decide on its own, and what needs a check-in first>

JUDGMENT: <only for a mandate that buys a quality verdict, better or worse, against a
gold, an advisor note, or a baseline. State in ten or more characters what verdict is
being bought, then run this on opus at minimum. Delete this whole line otherwise.>

Round: <the round number, only on a second or later fix round>
Research: <path to a research lane's report, or "not needed, <reason>" — required from
round 3 on>

Termination: report to the path above, verdict on line 1, then stop. A bare "Done"
means read the file; nothing is trusted from a final message alone.
