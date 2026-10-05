# The problem (draft for Ben's edit, written by the lead from Ben's own words, 10/4)

Owner: Ben. Only Ben changes this file. The lead proposes edits as a diff on the decisions page; Ben accepts or rewrites. Every line below that is not in quotation marks is the lead's reading and is the first thing to correct.

## What keeps happening

"Every complex system I have tried to build with LLM agents so far has gone the same way. I don't understand enough to make some decisions, so I defer them to Fable. I want to automate as much as possible, so I ask Fable to orchestrate other agents. I make local decisions as Fable asks. At the end of weeks and months of work, I have a massive codebase consisting almost entirely of patches, which still does not solve the actual problem and now is so complicated that it never can." (10/2)

"Project after project, we kept building patches on top of patches to fix the issues we were running into, making our codebase more complex, yet kept running into more and more new issues and could never be done." (10/2)

This harness is the latest instance. It was built to prevent the pattern and reproduced it: about 3,000 files, 3,700 tests, dozens of lanes, and a day on which twelve lanes closed and none removed a part.

## What Ben wants instead

"I wanted to instead RETHINK, on every planning turn (different from every turn), and always be willing to throw out our planned architecture for a simpler one that wouldn't have the class of problems rather than fixing each problem in the class as it appears. One of my core goals is to develop the simplest architecture possible to solve a problem, and use all our learnings from complexity to go back to the drawing board and rethink as something simpler." (10/2)

The end state: "a final orchestration harness that creates amazing outputs in a perfect blend of human intelligence and machine intelligence, with human input guiding at exactly the right moments and the code and architecture staying super simple, clean, and cleaned up from as-we-go messes of patches, worktrees, file detritus everywhere." (10/1)

What Ben wants, in his words on 10/5, ticking no-go on a proposal to pause the harness and do a project task instead: "you have to trust me that i've been extremely frustrated with the dev process and exactly how, and that I want a set of tools, including tools for agents to communicate with each other, to multi build, to continually revise towards removing, not adding, to rethink the architecture regularly in pursuit of the simplest path to the real goal, to communicate with me effectively (ie Notion), to store, triage, and read memories when appropriately, and to clean up as we go, not leaving piles of garbage everywhere". He is the solo developer and does not track issues in GitHub; a backlog read is not a signal of what he wants.

## The lead's reading of the mechanism, to be corrected

- When Ben defers a decision, nobody holds the problem. The agent holds the plan, and the plan is its context, so it cannot throw the plan away.
- The options brought to Ben assume the architecture, so his local decisions steer inside it. He is asked to judge designs, which he cannot, instead of problems and failures, which he can.
- Every agent turn wants to end with something merged. Rules that admit a change if it "moves a measure" let every patch in and almost no deletion.
- Knowledge of why a part exists dies with each session, so the next session adds a part instead of removing one.

## What "solved" looks like, in Ben's terms

- Ben can say, for each failure he has complained about, whether it has stopped happening.
- The codebase for a project gets smaller or stays flat while the problem gets more solved. A planning turn that ends with more parts than it started with must name the failure each new part answers.
- Ben decides only things he has feedback on: is this my problem, go or no-go, how much to spend, did the failures stop. He is never asked to pick a design.
- The method itself stays four files and a conversation. If it grows scripts, that is the pattern returning.

## Scope

Ben's general pattern across every agent-built project. This harness is the first instance worked on, and "no harness, stock Claude Code and Codex plus a few files" is a legitimate answer.

## What Ben is unsure about, in his words

"This is my fault for wanting the automation in the first place. But I have hope that together we can come up with a better way." (10/2)
"I don't think I have the judgment to select from two sets of architecture at every planning stage." (10/2)
