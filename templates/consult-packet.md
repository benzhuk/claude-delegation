# Consult packet — for a cheaper session escalating to the top tier

## When to escalate

Only these categories. Never "when you judge it important".

- (a) an irreversible or costly action: merge to main, push, publish, apply a
  migration, start a run over a set dollar threshold.
- (b) an architecture change: a new mechanism, a new engine, a contract or schema
  change.
- (c) a quality verdict against a gold, an advisor note or a baseline.
- (d) a contradiction between two sessions' rulings, or weakening an existing guard.
- (e) the third fix round on one defect class.
- (f) anything the owner has an open decision on.

If a category needs a number (the dollar threshold in (a)), it is the one in your
mandate; with no number given in your mandate, escalate.

## The packet

At most two pages, these headings, in this order:

```
QUESTION: <one decidable sentence>

OPTIONS:
- <option 1>
- <option 2>
- <option 3, optional>
- <option 4, optional>

EVIDENCE: <commands run and their output, paths, short shas>

WHAT IS REVERSIBLE: <what can be undone, and the cost of being wrong>

RECOMMENDATION: <the option and a confidence>

DEADLINE: <when an answer is needed>
DEFAULT: <what fires if no answer arrives by the deadline>
```

Send it with `note-send --kind ASK --needs decision --packet-file -` (the `multi`
skill), piping this file in. The top tier answers in a fresh small session that reads
only the packet — never the sending session's full history — and appends the answer
under an `ANSWER:` heading at the bottom of the same packet file, so it survives both
sessions.

## Example (synthetic, filled in)

```
QUESTION: Should the retry queue back off exponentially or at a fixed interval?

OPTIONS:
- Exponential backoff, cap at 5 minutes (recommended)
- Fixed 30-second interval

EVIDENCE: `node scripts/queue-bench.mjs --runs 50` — fixed interval hit the
upstream rate limit 6/50 runs; exponential hit it 0/50. Commit a1b2c3d.

WHAT IS REVERSIBLE: fully — a config value, no data migration.

RECOMMENDATION: exponential backoff, cap at 5 minutes. Confidence: high.

DEADLINE: next deploy window.
DEFAULT: exponential backoff, cap at 5 minutes.
```
