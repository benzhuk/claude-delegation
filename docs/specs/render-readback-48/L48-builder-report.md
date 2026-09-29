VERDICT: PASS
Base: 926c6f801ce21383b06bd5f92ffb18b5ca2603bc; source before 826e025c4a7b82d2473efef26ce686775a9efbf3; source after feda39eb9dcfa4e171bee06547846916afd10bb1.
Cause: Notion readback omitted the blank separator after a structural `</details>`, which normalize preserved.
Discriminating check: the exact snapshots were red on unchanged production (144 total, 143 pass, 1 exact-snapshot failure); final green exercises the repaired mutation and fenced-literal controls.
Fix location: skills/decisions/scripts/decisions-render-core.mjs normalize().
Simplification: one structural, balanced-details separator rule; no publisher state, retry, writer, or API change.
After proof: `node --test skills/decisions/scripts/decisions-render.test.mjs skills/decisions/scripts/decisions-render-publish.test.mjs` native exit 0, 145/145 pass against source feda39eb9dcfa4e171bee06547846916afd10bb1.
Raw green log: C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/render-readback-48/lane48-final-fence-green.raw.log
