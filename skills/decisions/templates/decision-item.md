# Decision item — fill-in shape

One toggle per decision, in Notion-flavored markdown (children indented one TAB
under their parent). The shape below is a fenced code block so it is not itself
read as a decision; copy it out of the fence, fill in the brackets, and paste the
result under the Open section of the page.

```
<details>
<summary>**[Decision title — short, unique on the page]**</summary>
	[One or two lines of context: the evidence that raised this.]
	- [ ] [Recommended option] (recommended)
	- [ ] [Second option]
	- [ ] [Third option, optional]
	- [ ] [Fourth option, optional]
	Default after [YYYY-MM-DD HH:MM ±HH:MM]: [the recommended option]
	<empty-block/>
</details>
```

For anything irreversible, costly, or that changes the owner's machines, replace the
last line with `No default: <reason>` instead of a deadline.

## Replying to an owner's comment (fenced — reference only, not a live decision)

```
	\*\* [the owner's question]
	Reply: 2026-09-22 09:00 -04:00 — [the answer]
```

The reply is its own line starting with `Reply:` plus the date. Never quote the
owner's line back when writing it — a copied `\*\*` prefix would be read as a
brand-new comment, and the item would never stop reporting as answered again.

A replied pair is archived to Closed on the first hand-back pass after the reply
date; an owner instruction (not a question) is done, logged in Closed and its line
deleted.

## Example (synthetic, filled in)

<details>
<summary>**Cap the nightly batch at 200 items or run it uncapped**</summary>
	Evidence: the nightly batch queue has outgrown the box's free memory twice this
	month; the last two runs were killed by the OS before finishing.
	- [ ] Cap the batch at 200 items per run, queue the rest for the next night (recommended)
	- [ ] Run uncapped and add a memory alert instead
	- [ ] Move the batch to a bigger box
	Default after 2030-06-15 18:00 -04:00: cap at 200 items per run
	<empty-block/>
</details>
