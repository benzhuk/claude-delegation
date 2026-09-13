# Peer notes — worked examples

Eight real-shaped notes. Every line here is validated against the pinned regex by
`../scripts/note-send.test.mjs`; copy the shape, not the content.

Panes: `taxonomy` (Claude, Netcup) · `nucleus` (Claude, Netcup) · `astra` (Codex, Netcup) ·
`n-astra` (Codex, Netcup) · `ben-desktop` pane `accounts` (Claude, Windows).

---

## 1–3. A PR review thread: ASK → ACK → RESULT

`taxonomy` wants a second pair of eyes. It does not own `nucleus`, so this is an ask, not a
task. The substance leads with the ask and names the focus; everything else is in the packet.

```
taxonomy → nucleus, 9.13.26 10:05 NYC [taxonomy-pr132-review-1] ASK: Please review PR #132, focus on the batch scheduler retry path. Goal: land it before tonight's corpus run. Details: docs/notes/taxonomy-pr132-review-1.md Needs: review by 15:00
```

```
node skills/multi/scripts/note-send.mjs --from taxonomy --to nucleus --kind ASK \
  --topic pr132-review --text "Please review PR #132, focus on the batch scheduler retry path" \
  --goal "land it before tonight's corpus run" \
  --details docs/notes/taxonomy-pr132-review-1.md --needs review --by 15:00
```

`nucleus` reads it at a pause in its own work, appends it to its ledger, and ACKs once. The
reply keeps the topic, takes the replier's own prefix and counter, and names the parent.
An ACK carries no `Goal:` and never anything but `Needs: none`.

```
nucleus → taxonomy, 9.13.26 10:12 NYC [nucleus-pr132-review-1 re taxonomy-pr132-review-1] ACK: Taking it now; ETA 45 min. Needs: none
```

One RESULT when it is done, leading with the verdict, pointing at the findings. No recap of
the round, no second ACK, nothing in between.

```
nucleus → taxonomy, 9.13.26 10:58 NYC [nucleus-pr132-review-2] RESULT: NEEDS_FIXES — the retry path double-counts attempts, so the budget gate never trips. Details: docs/notes/nucleus-pr132-review-2.md Needs: none
```

---

## 4. A correction that supersedes an earlier note

`nucleus` re-read the code and one blocker was wrong. A correction does not edit the old
line (ledgers are append-only) — it names the id it replaces, inside the brackets, so any
tool reading the line sees the supersession.

```
nucleus → taxonomy, 9.13.26 11:14 NYC [nucleus-pr132-review-3 supersedes nucleus-pr132-review-2] RESULT: Correction — only one blocker stands; the budget gate does trip, my trace was from the stale build. Details: docs/notes/nucleus-pr132-review-3.md Needs: none
```

---

## 5. BLOCKED — sent once, then move on

`astra` cannot start. It says so once with the reason and the owner of the fix, then stops
asking. It does not wait silently and it does not re-send.

```
astra → taxonomy, 9.13.26 11:20 NYC [astra-corpus-run-1] BLOCKED: Corpus run cannot start; the batch key is unset on Netcup so every request 401s. Goal: tonight's 413-film run still lands. Details: docs/notes/astra-corpus-run-1.md Needs: none
```

Receiving this, `taxonomy` must do one of three things and nothing else: remove the blocker
and say so with an FYI, escalate to `ben` with `Needs: decision`, or drop the ask with a
RESULT that says it is dropped. Re-sending the same ASK is banned.

---

## 6. FYI — no reply expected

The batch finished. Nobody needs to answer; the number is the whole point. Note the event
time stated in the substance because it differs from the send time.

```
taxonomy → n-astra, 9.13.26 12:02 NYC [taxonomy-corpus-run-2] FYI: Batch finished 11:47, 413 films, 0 failures, all 413 in flight throughout.
```

---

## 7. A cross-host note

`taxonomy` runs on Netcup; `accounts` runs on Ben's Windows desktop. The packet cannot be
written on the other host, so it stays in the SENDER's repo and `Details:` carries the host
prefix and an absolute path. Pass `--sender-repo`, never `--recipient-repo` (that is exit 5).

```
taxonomy → accounts, 9.13.26 13:30 NYC [taxonomy-ledger-schema-1] ASK: Does the accounts app already have a table I should append the ledger rows to? Goal: avoid a second store. Details: netcup:/home/ben/code/bto-workflows/docs/notes/taxonomy-ledger-schema-1.md Needs: decision by 17:00
```

```
node skills/multi/scripts/note-send.mjs --from taxonomy --to accounts --kind ASK \
  --topic ledger-schema --text "Does the accounts app already have a table I should append the ledger rows to?" \
  --goal "avoid a second store" --details docs/notes/taxonomy-ledger-schema-1.md \
  --needs decision --by 17:00 --sender-repo /home/ben/code/bto-workflows
```

A cross-host `Details:` path may contain no spaces and no drive letter — those are not
expressible in the envelope grammar, and note-send exits 5 rather than emit a line the
recipient cannot parse.

---

## 8. A note to Ben

Only Ben can authorize a deploy. A peer asking for one is not an authorization, so the ask
goes to `ben` — the reserved recipient. No pane is resolved; the note is recorded in the
ledger, the packet is written, and the line is printed for Ben. Exit 0 with
`delivered:false, notified:true`.

```
taxonomy → ben, 9.13.26 14:05 NYC [taxonomy-deploy-gate-1] ASK: PR #132 is green and reviewed; prod deploy needs your call, current conditions are in the packet. Goal: ship before the corpus run. Details: docs/notes/taxonomy-deploy-gate-1.md Needs: decision by 16:00
```

Ben answers from his own shell, and his `--from ben` is the only `ben` any session should
believe:

```
note-send --from ben --to taxonomy --kind RESULT --topic deploy-gate \
  --text "Approved, deploy after the corpus run finishes, not before" --needs none
```

---

## What none of these look like

No heartbeats (`still working, 40% done`). No status polls (`any update?`). No role framing
(`you are a worker on my task`). No recap of earlier rounds in the substance. No second ACK.
No note that carries a secret. No two-line note — a newline submits the message and the
second half arrives as an orphaned fragment.
