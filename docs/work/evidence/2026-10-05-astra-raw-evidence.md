VERDICT: EVIDENCE

# Raw repository audit, October 5, 2026 (America/New_York)

Author: independent raw-evidence subagent for Astra's method review. This is a bounded document-only audit, not a causal experiment. No tests, builds, source changes, commits, host inspection, or external messages were performed. Proposal contents were not opened. Git metadata necessarily exposed proposal filenames and commit subjects; history extracts also contain adjacent lead interpretations. Those interpretations are not used as independent facts.

## What the evidence supports

There is substantial accumulation, repeated work on the same subsystems, and specific instances where successful local checks did not deliver the intended operating behavior. This supports investigating the architecture and work method. It does **not** establish that the codebase is almost entirely patches, that its problems can never be solved, or that any proposed replacement will produce equal quality at lower cost. Most tracked-file growth is documentation; accepted records and passing test totals measure different things from useful product outcomes.

The three requested raw reports are untracked files in the main checkout, absent at the audited commit. I read those exact files there on the parent agent's clarification. Their declared snapshot is f2cb3970, October 1 at 8:43 PM America/New_York. Their host counts are historical reported observations, not remeasured host state. `git status --short -- <the three paths>` returned `??` for each. No permission denial occurred in this audit; the initial missing-file errors were ordinary path-not-found errors. Denials described inside historical reports are those authors' observations.

## Reproduced counts

| Definition | Pre-window main ancestor e4f4d950 | Raw-report snapshot f2cb3970 | Audit snapshot ec01f4e8 |
|---|---:|---:|---:|
| Tracked paths in Git tree | 54 | 3,082 | 3,246 |
| Paths under docs/ | 9 | 2,798 | 2,924 |
| All other tracked paths | 45 | 284 | 322 |
| Files ending .test.mjs or .test.js | 11 | 76 | 84 |
| skills/*/SKILL.md entrypoints | 3 | 8 | 8 |
| Direct docs/work/*.record.md | 0 | 136 | 141 |
| accepted / closed / reviewed / withdrawn / blocked | 0 | 77 / 47 / 7 / 4 / 1 | 82 / 47 / 7 / 4 / 1 |

The pre-window ancestor is the latest first-parent commit before September 20 midnight America/New_York; its own commit date is September 19. It is a tree baseline, not an estimate of when every merged branch's work began. At ec01f4e8, recursive record counting gives **149**, because eight archived records add seven runnable and one delivered. Record counts therefore depend on whether archives are included. Parent and child records coexist; 141 records are not 141 distinct independently delivered features. The status field is the first literal `Status:` line, not a reconstructed transition history. No opened-to-closed duration or closure rate is inferred.

The audit snapshot has 1,575 docs/specs paths, 1,084 docs/work paths, 209 docs/reports paths, and 56 other docs paths. About 90% of its files are under docs/. The local inventory's f2cb3970 count of 3,082 files, 76 test files, and 136 direct records reproduces exactly. Its docs subcategory prose says seven loose files, whereas the tree has **17**; the overall docs count of 2,798 is correct. Its later reference to 144 work records is compatible with including eight archived records, but that denominator is not explained there.

From September 20 midnight America/New_York through ec01f4e8, Git returns 2,338 reachable commits, 624 on the first-parent chain. These are history events, not feature counts. Non-merge numstat sums are: docs 565,066 added / 28,050 removed lines across 4,791 file-change entries; other paths 118,171 / 14,488 across 2,110 entries. Repeated edits, branch histories, duplicated/cherry-picked work, generated evidence and imports can inflate these sums. Net baseline-to-audit diff is 3,237 changed paths, 640,893 inserted and 465 removed lines: 3,192 added paths and 45 modified paths, with no net deleted baseline path. This does **not** mean no parts were removed during the interval.

## Removal and addition evidence

- September 21, `71b961f2`: artifact registry, its schema/tests, and commit-check/test were cut after review (five paths). These had been introduced inside the window, so endpoint comparison hides their removal.
- September 30, `0ff833b2`: continue skill plus continuation runtime/native hook and tests were retired (nine paths). This is direct counterevidence to an unrestricted claim that agents never remove parts.
- `2ef9f70d`: guard-denials reader/test removed from one lane with scope deferred to lane 70 (two paths). This is a lane scope change; it is not proof the overall capability was permanently simplified away.
- Between f2cb3970 and ec01f4e8, 166 paths were added, two deleted and 57 modified. Runtime filenames newly present include five janitor modules (archive, owner, roots, sweep, timer-refresh), knowledge-publish-sync, and report-check. File decomposition can improve modularity or increase coordination cost; filenames alone cannot decide which.

## Part inventory and evidence limits

These are functional families from the allowed inventory and tree paths, not an asserted dependency-complete architecture. Runtime counts and contracts in the local inventory are its author's observations unless reproduced above.

| Part | What exists / event evidence | What remains unproved |
|---|---|---|
| Goal context | goal-card, goal-context, delegation-reminder; owner asked for a compact card and mirror | Exposure and changed decisions are not measured by validating card format |
| Bearings | skill and bearings-state; daily check chosen September 23 | A verdict file does not prove a prediction was checked or behavior changed |
| Decisions / Notion | reader, handback, pickup, render/publish, title, goals mirror; separate notion-writing/page-lint | Reader and publishing checks do not establish dependable owner-to-agent operation across hosts |
| Peer communication | multi skill; envelope, inbox, send, flush, notify, transport, session-name; Claude and Codex hooks | Delivery labels, waking and actual reading/acting need separate evidence |
| Delegate / team-build | instruction skills, loop workflow, accept-prep, review-run, builder/reviewer/integrator/runner roles | Static references miss agent-invoked entrypoints; 'no script calls it' does not imply unused |
| Work records / collector | work-record, collect-status, collect-from-origin, work-census | Accepted/closed states do not prove merge, install, cleanup or end-user benefit; branch-only state may be invisible |
| Cost and throughput measurement | build-census, token-census, four-read | No controlled equal-quality comparison; recording windows and stall attribution changed during development |
| Cleanup | janitor, reclaim, timer installer; additional janitor modules by audit snapshot | Historical uncovered classes establish a scope gap, not that every retained file is waste |
| Guards | dispatch, delete, path-safety, resume-size, worktree-location | Enforcement can itself block legitimate work; default advisory behavior differs from blocking behavior |
| Knowledge | read logger/counts, gather, triage and later publish-sync | Counting reads is not measuring learning; archived notes are not proof that lessons help downstream projects |
| Deployment / host wiring | mirror-shared-skills, hook trust, wiring-check, plugin-staleness and manifests | Presence in repo is distinct from installed version and behavior of already-running sessions |
| Test infrastructure | run-tests, test-home, fixtures and 84 named test files | Test-file count is not executed test cases, coverage, independence, quality or absence of real-home side effects |
| Dev server | skill entrypoint | An agent-selected skill can be useful without a static caller; this audit supplies no use measurement |
| Retired continuation | deletion commit above | Removal is demonstrated; whether native host behavior fully substitutes is not measured here |

## Brief event timeline

Dates below follow the history filenames in America/New_York. Entries are contemporaneous agent records, not newly observed executions.

- September 20–22: decisions reader/skill merged; old lifecycle hook removal recorded; goal card and Notion mirror introduced; first live build-loop releases recorded.
- September 23–24: daily bearings selected; Done defined as human submission; ownership handoff and multi-host rollout. An independent verifier caught a stale Codex manifest version. Mac validation remained deferred.
- September 25–26: parallel lanes and instrumentation shipped. September 26 history documents an 11.2-hour ask-to-accepted lane presented as 3.6 hours because `Opened:` excluded a 7.6-hour wait for a fresh session. This is concrete measurement bias, not merely a low score.
- September 27–28: further measurement, cleanup and publication repairs. September 27 history records a test-induced /tmp inode outage, a builder stalled on a delete prompt, and a janitor live check catching `--help` installing into the real home. September 28 adds a guard against publishing text that Notion would autolink.
- September 29–30: census/host fixes and knowledge triage; owner requests retirement census for continue. Continue removed. Owner-directed cleanup records 60 local Windows and 47 origin branches deleted, and clean worktrees removed in other projects. These are distinct cleanup actions, not proof of ongoing prevention.
- October 1: 0.20.19 reaches four machines; stale janitor edits had dirtied two checkouts and required recovery. First scheduled triage processed 60 of 80 notes but publication diverged and left ATTENTION/lock. Ben asks where the integrated component plan went and whether cleanup now prevents the mess he just removed.
- October 2: cleanup lane accepted with 3,710 tests reported green; new cleanup classes await policy approval then install. History records a branch-only open record invisible to main-reading cleanup, and pickup failing with PRIVATE_CAPTURE_UNAVAILABLE while owner ticks were read manually. These failures occurred despite substantial shipped work.

## Audit of headline claims

The local detritus report counted 216 untracked files but 203 status lines because directories aggregate paths. Its 193 peer packets, 8,815 backup files and 1,429 work-state files are neither tracked code nor automatically disposable. Its merged-branch count was taken after a scheduled janitor run; zero removed at that earlier run is not a matched opportunity-to-remove test. Dirty/unmerged branches include ongoing work, not just abandoned work.

The '38 census lanes / 21 pickup lanes / 13 build-loop lanes' figures are keyword hits in the first 12 lines of records. Categories overlap, and body hits differ dramatically. They establish recurrence of topics, not 38 defects, 38 failed designs or 38 necessary patches. The raw report lists only 26 of its 38 census identifiers, so its full set is not recoverable from that table alone. The inventory's approximately 3,398 `test(`/`it(` lines is a static syntax count, not an executed suite total.

Ben's claim that the work has missed his real objective is direct owner evidence about satisfaction and scope. The recorded examples make it credible that local acceptance and test success failed to guarantee integrated operation. They do not yet measure quality-adjusted speed/cost on Cadma, BTO or the smaller apps, or prove that the whole harness is the cause. Repeated repairs could include necessary hardening, growing scope, environment-specific failures, measurement correction and avoidable architectural repair; these sources do not partition them.

## Reproduction (Python run from the audit worktree; read-only)

```python
import subprocess, re, collections
def git(*args):
    return subprocess.check_output(['git', *args], text=True).splitlines()
end = 'ec01f4e8'
start = '2026-09-20T00:00:00-04:00'
base = git('rev-list', '--first-parent', '-1', '--before='+start, end)[0]
for ref in (base, 'f2cb3970', end):
    paths = git('ls-tree', '-r', '--name-only', ref)
    records = [p for p in paths if re.fullmatch(r'docs/work/[^/]+\.record\.md', p)]
    states = collections.Counter()
    for p in records:
        lines = git('show', ref+':'+p)
        state = next((s.split(':',1)[1].strip() for s in lines if s.startswith('Status:')), 'MISSING')
        states[state] += 1
    print(ref, len(paths), sum(p.startswith('docs/') for p in paths),
          sum(bool(re.search(r'\.test\.(mjs|js)$',p)) for p in paths), len(records), dict(states))
print(git('rev-list','--count','--since='+start,end))
print(git('rev-list','--first-parent','--count','--since='+start,end))
print(git('diff','--shortstat',base,end))
print(collections.Counter(s.split('\t')[0][0] for s in git('diff','--name-status',base,end)))
churn = collections.defaultdict(lambda: [0,0,0])
for line in git('log','--since='+start,'--no-merges','--format=','--numstat',end):
    fields=line.split('\t')
    if len(fields)==3 and fields[0].isdigit():
        row=churn['docs' if fields[2].startswith('docs/') else 'other']
        row[0]+=int(fields[0]); row[1]+=int(fields[1]); row[2]+=1
print(dict(churn))
print('\n'.join(git('log','--since='+start,'--no-merges','--diff-filter=D',
    '--format=%h %s','--name-only',end,'--','scripts','hooks','skills','contracts')))
# Full stat listing is large; initial console output was truncated.
# git log --since=2026-09-20T00:00:00-04:00 --stat ec01f4e8
```

Remaining evidence gaps: comparable downstream-task outcomes, total billed cost, owner attention time, exposure/use denominators, meaningful defect severity, and a stable definition of quality. No replacement-method efficacy claim is warranted from this audit alone.
