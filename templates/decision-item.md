# Decision item — fill-in shape

One toggle per decision, in Notion-flavored markdown (children indented one TAB
under their parent). The shape below is a fenced code block so it is not itself
read as a decision; copy it out of the fence, fill in the brackets, and paste the
result under the Open section of the page.

```
<details>
<summary>[Decision title — short, unique on the page]</summary>
	[One or two lines of context: the evidence that raised this.]
	- [ ] [Recommended option] (recommended)
	- [ ] [Second option]
	- [ ] [Third option, optional]
	- [ ] [Fourth option, optional]
	[Default if unanswered by <day, time, zone>: <the recommended option>]
</details>
```

For anything irreversible, costly, or that changes the owner's machines, replace the
last line with `No default — <reason>` instead of a deadline.

## Example (synthetic, filled in)

<details>
<summary>Cap the nightly batch at 200 items or run it uncapped</summary>
	Evidence: the nightly batch queue has outgrown the box's free memory twice this
	month; the last two runs were killed by the OS before finishing.
	- [ ] Cap the batch at 200 items per run, queue the rest for the next night (recommended)
	- [ ] Run uncapped and add a memory alert instead
	- [ ] Move the batch to a bigger box
	Default if unanswered by Thu 9/25, 6pm NYC: cap at 200 items per run.
</details>
