VERDICT: PARTIAL

Candidate artifact: `cd5fecccad1028298fb7811c77cff133c2d4c750`.

Native census command used the record's exported `Lead-session` identity
`01a0df4c-2809-7520-b1d7-876cc51a87ee`, record `Opened` time
`2026-09-29T02:31:00Z`, and the common fixed end `2026-09-29T03:54:17Z`.
Native exit: 0. The census is PARTIAL because child
`01a0eb03-ad86-7020-8bbe-723da3ab9581` has no end-bound witness in that
requested window; `coverageSupported` is false.

`four-read` also exited 0 but reports unavailable token and elapsed values because the
reviewed record has no accepted Log entry. This evidence is not eligible for acceptance:
the required census is PARTIAL, so use an explicit no-census reason if the record workflow
permits continuation. No record or acceptance action was performed.
