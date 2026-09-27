# measure-truth-1: pinned contracts (lead's rulings on the spec)

Spec: `docs/specs/measure-truth-1/spec.md` (lane fourteen, copied from origin 65a50a0:docs/specs/2026-09-27-measure-truth.md). Base: origin/main 380a666. Territories: F1, F2, F3. The spec stands except where these rulings pin or correct it. The lead checked the facts below against the real records on 2026-09-27 at 04:40 NY.

## Facts
- The fixture pairs, with the record path in each:
  - Lane eleven: `docs/work/wr-2026-09-26-janitor-origin.record.md`. Pre-fix 2f197f1 has no Spec-from. Post-fix 65d2994 adds `Spec-from: 2026-09-26T22:14:00Z`.
  - Lane fifteen: `docs/work/wr-2026-09-27-ledger-both-halves.record.md`, pre-fix c36e4d3 and post-fix d0da77c. BOTH have `Spec-from: 2026-09-27T00:05:00-04:00`, an offset, not Z. The fix added an `accepted` Log line naming the missing L1 approve. No mechanical rule can see a missing per-territory review line.
  - Lane sixteen: `docs/work/wr-2026-09-27-delete-deny.record.md`. In pre-fix 4e01139 the model-less `D1 APPROVE b7a3fef (4 rounds)` is on a `delivered` Log line, not a `reviewed` one. Post-fix 9c4e1b0 adds `Opus reviewer` to it and also adds a body `Gap:` paragraph.
- To get a fixture's bytes, run `git show <sha>:<path>` in this repo and commit it under the test's fixtures directory (F1: `scripts/fixtures/work-record/measure-truth/<lane>-<sha>.record.md`).
- The trimmed session fixtures are already committed at `scripts/fixtures/four-read/sessions/` and belong to F2. Every line carries only `timestamp`, `type`, and `message.content[]` items of `{type:'tool_use',name,id}` or `{type:'tool_result',tool_use_id}`, and no other text. Each lane directory holds the lead jsonl, plus `<session>/subagents/agent-*.jsonl` and `<session>/subagents/workflows/<run>/agent-*.jsonl`, trimmed to each build's window:
  - lane10: lead f6c8ae21…, window 2026-09-26T22:35:00Z..2026-09-27T02:49:52Z. Its builder `workflows/wf_7223f595-b7d/agent-a314563636ff6b931.jsonl` is silent for 216.8 min from 2026-09-26T22:44:29.665Z; that is the stall.
  - lane16: lead 588290d9…, window 2026-09-27T06:20:18Z..2026-09-27T07:50:17Z. The lead gap of 41.8 min from 2026-09-27T06:20:46.606Z lies inside its one `Workflow` tool_use span.

## R1. Strict cutoff (F1), which defeats backdating
- Export a frozen constant `STRICT_FROM = '2026-09-27T08:32:15Z'`, this lane's Opened.
- A record is **strict** when its effective opened instant is at or after `STRICT_FROM`.
- The effective opened instant is the later of `Opened:` and the author time of the first git commit that added the record file (`git log --diff-filter=A --format=%aI -- <record>` in `--repo`; take the earliest if there are several).
- A record Opened a minute before the merge is therefore strict, and backdating `Opened:` buys nothing once the file is committed.
- If the record has no commit yet, `Opened:` alone decides, which is still strict for any new work.
- `checkAcceptance`/`acceptRecord` take an optional `strictFrom` in opts, for tests only. There is no CLI flag, because a flag would be the bypass.
- A non-strict record gets one warning line in the accept output, which names the rule: `strict-exempt: Opened before <STRICT_FROM>; Spec-session/Spec-from/model rules are warnings for this record`.

## R2. Field refusals (F1, spec item 1)
- A strict record is refused with one error line per field, each naming the field and the fix:
  - `Spec-session:` absent or a placeholder.
  - `Spec-from:` absent, or not matching `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$`. An offset form such as `-04:00` is refused, and the fix line says to convert it to UTC with a Z.
- Every record is refused on `Base:` unless it is exactly one 40-hex sha. Strict or not, nothing is exempt from Base.
- Keep the existing WARN text for non-strict records.

## R3. Model on review lines (F1, spec item 2, widened to catch lane sixteen)
- Model tokens are a hardcoded list:
  - top: Fable, GPT-6-Astra
  - high: Opus, GPT-5.6-Sol
  - mid: Sonnet, GPT-5.6-Terra
  - fast: Haiku, GPT-5.6-Luna, GPT-5.3-Codex-Spark
- Matching is case-insensitive and whole-word, bounded by non-`[A-Za-z0-9.]` or string edge, so `claude-opus-5-5` counts as Opus.
- A test parses the tier table rows of `docs/model-tiers.md` and fails if the list and the table differ. That is the sync.
- **Negation**: a token does not count when `no`, `not` or `without` appears within the two words before it. For example, `no Opus reviewer was used` names no model.
- The rule applies to Log lines dated at or after `STRICT_FROM` in a strict record. It covers every Log line with status `reviewed`, plus any Log line of another status whose note contains the whole word `APPROVE`. Each such line must contain a counted model token.
- Exception: a `reviewed` line whose note contains the whole word `SKIPPED` (the loop's `seam SKIPPED`) needs no model.
- Every strict record also needs at least one `reviewed` Log line whose note contains a counted high- or top-tier token and the whole word `APPROVE`.
- The error names the offending line's timestamp.
- Old lines are not re-judged, and the four-token Log grammar is unchanged.

## R4. Stall-word check (F1, spec item 3)
- Pattern, case-insensitive: `\b(hung|stall(ed|s|ing)?|relaunch(ed|es|ing)?)\b`. It never matches `installed` or `install`.
- It applies to Log lines dated inside [Opened, accept instant], in every record, strict or not. This check is new, and a zero next to a contradicting line is always wrong.
- If any line matches, the record is refused unless one of these holds:
  - the leading integer of the `Four numbers: Work lost or stalled:` line is non-zero;
  - the record carries an unindented body paragraph starting `Stall:` or `Gap:` that gives the reason.
- If there is no Four numbers line at all (no `--four-read`), this check is skipped and says so in a warning.
- The doc calls this coarse. It stops a zero from being written next to a Log line that contradicts it.

## R5. Fixture expectations (F1, spec item 4, corrected)
- Pre-fix records, under `strictFrom` injected as `'2026-09-26T00:00:00Z'`:
  - 2f197f1 is refused naming `Spec-from`.
  - c36e4d3 is refused naming `Spec-from` (the offset).
  - 4e01139 is refused naming the model rule on the `2026-09-27T07:42:29Z` delivered APPROVE line.
- Post-fix records, under the same injected cutoff:
  - 65d2994 and 9c4e1b0 pass the new rules. Assert the absence of the new errors, not a full accept, since evidence files and git state are absent in the fixture.
  - d0da77c is refused on `Spec-from` alone. This is the spec's own inconsistency and the test documents it with a comment.
- Under the real `STRICT_FROM`, all six are non-strict: each prints `strict-exempt`, and each is refused only on the rules that apply to every record (Base, stall words).
- Assert whatever lane fifteen's Log `hung`/`relaunched` and its `1 gap(s)` line produce; it should pass R4.
- Test every attack from the spec's Acceptance paragraph that belongs to F1:
  - Spec-from with an offset;
  - `no Opus reviewer was used`;
  - a record Opened one minute before `STRICT_FROM`, whose file was first committed after it, is strict;
  - backdated Opened;
  - `installed`.

## R6. Four-read gap classes (F2, spec item 1)
- **Spans**: for every lead `tool_use` named `Agent`, `Task` or `Workflow`, the span runs from that tool_use's timestamp to the timestamp of the first record carrying a `tool_result` with the same `tool_use_id`. If no result arrives, the span runs to the window end.
- **Union**: merge overlapping spans into one union before classifying, so nested or overlapping spans are never counted twice.
- **Splitting**: split a lead gap over 30 min at the union's boundaries.
  - A piece inside the union is `waiting-on-agents`.
  - A piece outside it is `stalled` only if that piece alone is over 30 min. Say this in the doc.
  - A 2-minute lead turn between two adjacent Agent calls ends the gap, so the two gaps are judged separately.
- **Line**: `N gap(s) over 30min stalled[: <list>]; M waiting-on-agents (X min)[; <agent stall lines>]; <ask part unchanged>`. N counts lead stalled pieces plus agent stalls. The measure is N.
- Keep the fewer-than-2-messages `unavailable` wording.

## R7. Subagent stalls (F2, spec item 2)
- **Files**: read `<lead dir>/<session id>/subagents/agent-*.jsonl` and `<…>/subagents/workflows/*/agent-*.jsonl`. These are the same shape, and the doc says both were read. Skip `journal.jsonl` and `*.meta.json`.
- **Scope**: a file counts only when its timestamp range overlaps the window.
  - A file with one timestamp has no internal gap.
  - Its tail silence is judged against its end bound.
- **Internal gaps**: a gap over 30 min between consecutive in-window timestamps is one stall.
- **Tail silence**: from the file's last timestamp to its end bound. It counts only when the file's last record holds a `tool_use` with no later `tool_result`, i.e. the agent was waiting on a tool (a permission prompt).
  - The end bound for a direct subagent is the lead's `tool_result` for the spawning `Agent`/`Task` tool_use (match by agent id where the lead result names it; otherwise the window end).
  - For a Workflow agent, the end bound is the first lead `TaskStop` tool_use after the file's last timestamp, else the Workflow tool_result, else the window end.
  - Say what was done in the doc.
- **Timestamps** that do not parse, or that lack Z or an offset, are rejected. The file is reported as `agent <id> unreadable timestamps`, never guessed as local time.
- **Output**: each stall prints `agent <id> silent <N> min from <ISO>`.
- **Fixtures**:
  - lane10 gives exactly one stall, for agent `a314563636ff6b931`, 216.8 min (about 3.5 h in the spec's wording).
  - lane16 gives 0 stalled and 1 waiting-on-agents of 41.8 min.
- The tests read the committed trimmed fixtures only, never `~/.claude`.

## R8. Codex and docs (F2 items 3–4, F3)
Codex is unchanged and still says unsupported. `docs/census.md` gets one paragraph each for the two classes and for the subagent rule. F3 inserts the spec's sentence verbatim, with one sentence per file and nothing else.

## R9. Territories, gates, boundaries
- **F1**: `scripts/work-record.mjs`, `scripts/work-record.test.mjs`, new `scripts/fixtures/work-record/measure-truth/`, and the doc that carries the record grammar, `docs/work-record.md` (edit only the acceptance and Log sections).
  - Gate: `node --test scripts/work-record.test.mjs`.
- **F2**: `scripts/four-read.mjs`, `scripts/four-read.test.mjs`, `scripts/fixtures/four-read/`, and `docs/census.md`.
  - Gate: `node --test scripts/four-read.test.mjs`.
- **F3**: `skills/multi/SKILL.md` and `skills/team-build/SKILL.md`, one sentence each.
  - Gate: `node scripts/run-tests.mjs` (no skill-text test exists at base).
- Integration gate: `node scripts/run-tests.mjs` on Linux with zero failures.
- Contract between F1 and F2: F1 parses only the leading integer of the `Work lost or stalled:` value, and R6 keeps that integer first, so N stays the stalled count.
- Every builder: never `rm -rf` or `git clean`, since a permission prompt hangs the loop for hours (lanes ten and fifteen). Leave temp files in the scratchpad or report them. The git identity is never set by an agent. No trailers.
