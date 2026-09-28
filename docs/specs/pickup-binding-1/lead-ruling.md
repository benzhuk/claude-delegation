# Lane 34 lead ruling (skills-n, 2026-09-28 3:15 PM New York)

The spec's pinned design (re-point the registration to a new clean checkout, no code) cannot meet its own acceptance.

Evidence:
- The pickup receipt path is keyed by page only: `receiptPaths`, decisions-pickup.mjs:114-125.
- The receipt stores the literal `project`. Any other project path then returns `PENDING_MANUAL_HANDOFF`: decisions-pickup.mjs:937-944 and :967-974.
- So a re-pointed registration makes every later round a manual handoff, forever, unless the private receipt is moved by hand. The skill forbids that kind of migration.
- The renderer's `defaultReadPickupCapture` (decisions-render-publish.mjs:97-117) calls `status({ repo, page })` with `--repo`. It has no project flag.

The ruling uses the spec's allowance to pick a design and say why:

**P1. Project identity resolves through the main checkout.** A checkout's authorization project is the realpath of its MAIN checkout, the same resolver `durableTransportRepo` already uses (`mainCheckout`, decisions-pickup.mjs:798-802).
- Every worktree of one repository is therefore one project.
- A non-git directory keeps today's behaviour (realpath of the path itself).
- A separate clone stays a different project, which is correct.
- `.agents/project.json` is still read from the checkout given on the command line: config validation is unchanged, and only the identity is normalized.
- It must apply wherever a project identity is computed or compared: pickup, status, open, account, the registration load, and anything else that calls `canonicalProject`/`registeredProject` for identity.
- It must NOT change `projectScope` for a main-checkout path. Existing receipts and captures bound to `/home/ben/Code/claude-delegation` must stay valid byte for byte, with no migration.

**P2. The registration is not moved.** Once P1 lands, `registrations.json` on Netcup already names the project. A publish from `/home/ben/Code/wt-ws-mainbase`, a clean worktree on branch main of that same repo, finds round 3.

**P3. The SKILL.md sentences.** skills/decisions/SKILL.md gains the two sentences the spec names:
- Where publish runs from: any clean checkout on branch main of the registered repository, a worktree included. The pickup round is found through the repository's main checkout.
- The merge-paragraph sentence, as the spec words it.

**P4. The verbatim tick.** If `--clear-done`'s verbatim check fails because 5446ae5 paraphrased the tick, the lead adds the quoted tick line to docs/decisions/history/2026-09-28.md in the merge commit.

**Acceptance (lane):**
- A test proves that a linked worktree of a repo resolves to the same project and `projectScope` as its main checkout, and finds a RECORDED round bound to the main checkout.
- A test proves that a main-checkout path's `projectScope` is unchanged from today's formula.
- A test proves that a non-git directory keeps its realpath identity.
- The existing pickup contract tests stay green.
- Live: round 3 is cleared by one `publish --clear-done` from wt-ws-mainbase, and the page reader then shows DONE false with no ticked item.
