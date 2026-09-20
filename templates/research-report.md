# Research report — <one-line question>

VERDICT: FOUND | NOT FOUND | MIXED | BLIND

Lane: <official docs | issue trackers | practitioner write-ups | alternatives | fetch-quote | skeptic>
Question: <the exact question this lane was asked to answer>
Time box: <only if this was a single-lane, fixed-time-box run>

## Findings

- <claim> — source: <URL> [PRIMARY | SECONDARY, reports <primary URL>], fetched <date>.
  "<quote copied verbatim from the fetched page>" or <paraphrase, labelled paraphrase>
- <claim> — source: <URL> [PRIMARY | SECONDARY, reports <primary URL>], fetched <date>.
  "<quote copied verbatim from the fetched page>" or <paraphrase, labelled paraphrase>

A number or a finding attributed to a study, a spec, a changelog or an issue is cited to
THAT page, fetched. A write-up repeating someone else's numbers is SECONDARY and must name
the primary it reports; if the primary was not fetched, the claim is unverified and is not
a finding. Never reconstruct a quote from a search-result snippet or from memory: quote
only text you fetched and can point at.

## Sources

| URL | fetched | what it shows |
|---|---|---|
| <url> | <date> | <one line> |

## What this does not settle

<the explicit boundary of this lane — what a different lane or the top session still
has to decide. A lane that answers everything it was asked is rare; say what's left.>

## Recommendation

<only if the mandate asked for one. One line, deferential — the top session
adjudicates across lanes, this lane doesn't rule for it.>

## Investigation reports (diagnosing a defect)

A lane diagnosing a defect (a third-fix-rule lane, a root-cause search) adds three more
headings, in this order, on top of everything above:

## Evidence

<the command you ran and the output it actually produced — not what you attempted>

## Hypotheses

<append-only, one line per hypothesis, each prefixed `REFUTED:` or `CONFIRMED:` plus
what settled it>

## Resolution

<only once the defect is actually fixed>

An orchestrator rejects an investigation report with no `REFUTED:` or `CONFIRMED:` line
— a hypothesis list with nothing settled hasn't investigated anything.
