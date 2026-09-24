VERDICT: PASS — Hetzner and Netcup now carry the approved triage/learn boundary content through the existing source and 0.20.4 mirror routes.

Executed via separate task-owned Orca terminals:
- Hetzner terminal term_b98802a2-24bc-4be7-a84c-c9804221640e
- Netcup terminal term_8558e194-4af7-49af-a1d9-af18fd471220

Both hosts:
- began at source HEAD 859e412, fetched origin/main successfully, and fast-forwarded to 342ce95d1ddc447d48b6c28fa1eeec5cbdbbd80b;
- backed up current triage/learn files under ~/.agents/rollout-backups/triage-learn-20260924-072012 (Hetzner) and ...-072011 (Netcup);
- ran exact source-path chezmoi apply with --error-on-conflict --less-interactive --exclude scripts;
- ran durable cache 0.20.4 mirror dry-run and apply, both exit 0 with no refusals or new hooks/plugins;
- have live and mirror LF hashes triage 498b3a645bc806c0fa27fd40ee1a03796cbc75801990da101b866f96e659e5fc and learn df7602846b5c7b1990bd425ddc1b40dc1b1ab1d0c4d3e8a3e3f8bcd2468ef656.

Those LF hashes are the expected Linux rendering of the approved Git blobs already discriminated against final candidates: triage bd3524f14cb9f38229042d3fd22ab9af23f8121b; learn 5c68fe984f64e897221f457492e7cd0b08a33339.

Protected knowledge stayed unchanged on both:
- INDEX 62c315f6d0e2272810621fdf6cd5a8b0d2d6075498fb74306052dbafdd4c3164
- cross-machine-recovery d1203496aaf3fca4f0e03432b1f340ea9ea7621cfa08e67eb945516a619ad50b

Hetzner source status is clean. Netcup retains only its pre-existing unrelated `M dot_config/claude/encrypted_private_claude.env.age`; it was neither read nor changed. No triage or knowledge publication ran.
