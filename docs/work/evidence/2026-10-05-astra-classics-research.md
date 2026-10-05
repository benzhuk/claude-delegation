VERDICT: RESEARCH

# Independent review of engineering and decision methods

October 5, 2026, America/New_York. Only the authorized local problem statement was read. No incumbent method, design, research, or proposal document was opened. This review does not independently verify the incidents in that statement. It examines transferability, not the merits of any unseen proposal.

## Judgment

The best-supported direction is to make the next investment answer a consequential uncertainty, retain enough coherent design to make changes safe, and expose a useful result to actual use before increasing commitment. That is an inference across the sources below, not a proven package or a prescription to install another process framework.

There is no controlled evidence here that adopting a named method will reduce Ben's project failures. Most classics offer causal mechanisms, examples, and experienced judgment. Their enduring agreement is informative but not independent experimental replication: these authors influenced one another. The directly relevant failure is confusing successful production of intermediate artifacts with improvement in the user's work.

Three distinctions matter:

- Delivery risk differs from usefulness risk. A fixed delivery appetite does not establish that the work is valuable.
- Behavioral correctness differs from architectural changeability. Tests can preserve today's behavior while a growing dependency structure makes tomorrow's change expensive.
- Decision authority differs from decision expertise. Ben can legitimately choose purposes and tolerable losses without being able to certify an agent's technical design.

The following method cards are deliberately compact. Each separates the source's claim from my proposed transfer. None should become a mandatory ceremony for every small edit.

## Evidence and reading conventions

**Controlled** means a comparative intervention study, not simply a claim about scientific thinking. **Observational measured** means recorded outcomes without random allocation. **Experience** means practitioner cases or accumulated experience. **Conceptual** means reasoning, examples, or a synthesis without a new outcome test. **Vendor** marks a commercial advocate's own claims; it can coexist with experience. These are descriptions of evidence, not a ranking of author intelligence.

**Full** means the substantive article/lecture text was read, not that an entire associated book was read. **Part** means identified substantive passages were read; PDF availability is not equivalent to full reading. **Abstract/snippet** items do not support retained method claims. Browser extraction truncated some long papers, so their status is conservatively Part. Mirrors below contain the primary author's text; the mirror host is not an independent corroborating source. No source is quoted verbatim in this report.

## Retained primary texts and bounded applications

### 1. Parnas: information hiding (1972)

**Problem:** changes spread across modules that expose shared implementation decisions. The KWIC example compares decomposition by processing steps against decomposition around hidden design decisions; it also acknowledges performance tradeoffs and an error in its own interface design. **Transfer:** inspect which recurring change crosses multiple components, then move ownership of that decision behind one interface. More files or agents do not establish modularity. **Cost/failure:** interface design and migration effort; a wrong boundary hides the wrong thing, and arbitrary abstraction adds burden. This is stronger support for a bounded architectural correction than for wholesale replacement.

**Grade:** Conceptual + experience from teaching examples; no controlled project comparison. **Read:** Full substantive paper transcription, with host warning that transcription accuracy is not guaranteed. [Parnas, On the Criteria To Be Used in Decomposing Systems into Modules](https://www.cs.lafayette.edu/~gexia/cs301/resources/parnas.html).

### 2. Parnas and Clements: rational design documentation (1986)

**Problem:** actual discovery is nonlinear, but maintainers need a coherent current account rather than chronological fragments. Requirements should describe acceptable externally visible behavior, explicitly identify missing information, and avoid implementation commitments. **Transfer:** maintain a short current behavioral contract and design rationale, while keeping historical evidence distinct. **Cost/failure:** documentation must be revised when invalidated. Replicating its whole document architecture for small work could produce exactly the paperwork burden under review. Reconstructing a clear rationale must not rewrite history or disguise uncertainty. Contrary to a paperwork-free approach, this source argues that explicit reference material reduces repeated questioning and knowledge loss.

**Grade:** Conceptual + experience. **Read:** Part: rationale, requirements, module/interface structure, maintenance, and documentation defects. [A Rational Design Process: How and Why to Fake It](https://www.laputan.org/pub/papers/Fake.pdf).

### 3. Royce: early operational feasibility (1970)

**Problem:** discovering storage, timing, or transfer constraints during late testing forces disruptive redesign. Royce criticizes the naive stage sequence, while still defending substantial planning and documentation. He explicitly distinguishes small internally operated programs from large customer deliveries. **Transfer:** exercise the riskiest operational path early and ensure someone understands the whole. **Cost/failure:** prototype and integration effort; transferring his heavy documentation demands from spacecraft work to every agent task would be unjustified. Conversely, invoking iteration does not erase consequential architecture constraints. This paper is not evidence that pure one-pass waterfall works, nor a manifesto for abandoning design.

**Grade:** Experience, explicitly presented as personal views. **Read:** Part: introduction, failure critique, preliminary design, documentation. [Managing the Development of Large Software Systems](https://blog.marsen.me/assets/royce1970.pdf).

### 4. Boehm: risk-driven spiral and termination (1988)

**Problem:** following a document or code sequence despite the wrong dominant risk. A spiral starts from a hypothesis about improving an operational mission; failure of that hypothesis can terminate it. Detail varies with risk. The paper also warns that evolutionary development can solidify workarounds and that poorly modularized legacy systems obstruct incremental replacement. **Transfer:** choose the next bounded activity by the uncertainty that could invalidate investment, including nonsoftware alternatives. **Cost/failure:** capable risk identification and review; a permanent risk register can become self-serving process. Neither iteration nor staged approval guarantees good risk judgment.

**Grade:** Conceptual + observational measured, with major confounding: reported TRW productivity gains compare against cost-model predictions and accompany a broad tooling/environment intervention. They do not isolate the spiral's causal effect. **Read:** Part: background, spiral process, initiation/termination, TRW rounds, results/evaluation. [A Spiral Model of Software Development and Enhancement](https://www.cse.msu.edu/~cse435/Homework/HW3/boehm.pdf). Initial HMC mirror timed out; no permission denial occurred.

### 5. Brooks: essential work and automation limits (1986/1987)

**Problem:** expecting a tool improvement to remove the difficulty of deciding and expressing the right system. Brooks distinguishes design complexity from accidental expression difficulties and discusses expert systems, reusable products, and requirements. **Transfer:** charge agents with reducing the uncertainty around desired behavior, not merely generating implementation faster; consider a usable existing product before growing bespoke infrastructure. **Cost/failure:** fit assessment and workflow adaptation have real costs. His discussion concerns contemporary languages and rule-based AI; it cannot establish the limits or productivity impact of present LLMs. It is a diagnostic lens, not a timeless numerical ceiling on automation.

**Grade:** Conceptual + experience. **Read:** Part: language/object abstraction, AI and expert systems, purchased software, portions of later recommendations. [No Silver Bullet](https://worrydream.com/refs/Brooks-NoSilverBullet.pdf).

### 6. Fowler: evolutionary design requires enabling practices (2000/2004)

**Problem:** incremental work degenerates into tactical accumulation when its design is not continually improved. Fowler makes evolutionary design conditional on disciplined refactoring, testing, integration, and design skill; he explicitly prefers planned design to undisciplined code-and-fix. **Transfer:** permit a useful increment to change structure when necessary, and preserve a cheap, reliable behavioral check. **Cost/failure:** test maintenance and refactoring competence. Passing tests alone does not validate usefulness; speculative flexibility also makes changes harder. This supports neither endless up-front design nor treating architecture as an automatic byproduct of completed tasks.

**Grade:** Experience + conceptual. **Read:** Part: planned/evolutionary design, enabling XP practices, simplicity and YAGNI. This is Fowler's own analysis, not a substitute for reading Beck's XP books. [Is Design Dead?](https://martinfowler.com/articles/designDead.html).

### 7. Fowler: incremental replacement (2004)

**Problem:** a large replacement postpones all value until risky cutover while rediscovering undocumented behavior. Fowler describes replacing behavior incrementally through interception and argues that partial delivery can still return value. **Transfer:** replace one malfunctioning capability behind a stable seam, demonstrate it, and retire the replaced route. **Cost/failure:** temporary adapters, dual operation, and migration obligations. My inference: if the seam requires maintaining two tightly coupled state models, the transitional burden may exceed a bounded cutover. The article's success example is not a comparative trial. Incremental replacement must include retirement; otherwise it simply adds another system.

**Grade:** Experience + conceptual. **Read:** Full original article. [Original Strangler Fig Application](https://martinfowler.com/bliki/OriginalStranglerFigApplication.html).

### 8. Ousterhout: complexity as difficulty of understanding and change (2019 lecture)

**Problem:** many small dependencies and inconsistencies accumulate until change becomes unsafe. The lecture advocates designing, implementing, evaluating, and revising repeatedly. **Transfer:** judge simplification by the amount a maintainer must understand for a representative change, not by line count alone. **Cost/failure:** deliberate design and review consume time; aesthetic cleanup can displace useful work. The course explicitly gives apparent complexity priority over correctness within limits: that educational choice must not be imported into production acceptance. This source supports continuous design but supplies no measured estimate of its payoff.

**Grade:** Experience + conceptual. **Read:** Full lecture notes, not A Philosophy of Software Design. [CS190 introduction](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter19/lecture.php?topic=intro).

### 9. Singer: appetite and a stop condition (Shape Up)

**Problem:** projects keep consuming future capacity after the original commitment. The introduction describes bounded bets, early integration, and a default stop rather than indefinite extension. Crucially, it explicitly excludes the risk of building the wrong thing from the book's central scope. **Transfer:** cap the investment in a useful slice and require a new justification if substantial uncertainty remains. **Cost/failure:** shaping requires experienced attention; pressure to finish can encourage concealed scope loss. A completed bet is not proof of value. A six-week cadence is not established as appropriate for Ben or agents.

**Grade:** Experience + vendor: an account of Basecamp's practice. **Read:** Part: introduction/targeting-risk passage and extracted circuit-breaker passages; not full book. [Shape Up introduction](https://basecamp.com/shapeup/0.3-chapter-01), [Betting Table](https://basecamp.com/shapeup/2.2-chapter-08).

### 10. Conway: design follows communication constraints (1968)

**Problem:** splitting responsibility prematurely can freeze communication boundaries into a fragmented system. Conway's argument includes incentives to overstaff and the need to keep organization flexible as design changes. **Transfer:** do not create agent roles and handoffs merely because execution slots exist; align responsibility with actual information needs. **Cost/failure:** fewer parallel lanes may reduce immediate throughput; centralization can itself bottleneck. The paper is a conceptual argument with anecdotes, not proof that a chosen team chart causes better architecture. Agent sessions differ from enduring human organizations, so this transfer is especially provisional.

**Grade:** Conceptual + experience. **Read:** Part: structure argument, examples, system management, conclusion. [How Do Committees Invent?](https://www.melconway.com/Home/Committees_Paper.html).

### 11. Team Topologies: cognitive burden and thin platforms

**Problem:** dependent teams and sprawling platforms interrupt flow of useful changes. The authors' current overview emphasizes cognitive limits, defined interaction modes, and minimal useful platform capability; it warns against taking team labels in isolation. **Transfer:** count the operational and coordination work that a harness removes or adds for its consumer. **Cost/failure:** assessment and responsibility negotiation; applying a multi-team organizational vocabulary to one owner and transient agents can manufacture roles and process. The page's broad outcome claims are not accompanied by controlled evidence. It is more useful here as a question about consumer burden than as an organizational blueprint.

**Grade:** Vendor + experience/conceptual. **Read:** Full substantive key-concepts page; no book or case-study dataset read. [Team Topologies key concepts](https://teamtopologies.com/key-concepts).

### 12. Womack: A3 is inquiry with participants, not a document

**Problem:** improvement staff generate attractive future-state artifacts without understanding the work or involving those affected. Womack describes that failure from value-stream mapping and cautions against repeating it with A3. **Transfer:** observe one real troublesome workflow and test the apparent cause with the person doing it before writing a correction plan. **Cost/failure:** real dialogue takes attention; assigning Ben the perpetual mentor role could worsen owner burden. Agent-generated A3 prose is not evidence of inquiry. Requiring another template for each failure would reproduce the defect the article warns about.

**Grade:** Experience + vendor: the article promotes a book while reporting the author's observation. **Read:** Full article, not Shook's book. [It Takes 2 (or more) to A3](https://www.lean.org/the-lean-post/articles/it-takes-2-or-more-to-a3/).

### 13. Rittel and Webber: problem framing changes what counts as success (1973)

**Problem:** efficiency against an assumed objective cannot settle disagreements over what improvement means. The paper treats social-policy problems as lacking final formulations and intrinsic stopping rules. **Transfer:** make whose burden is reduced explicit and let actual use revise the problem statement. **Cost/failure:** broader framing can consume unlimited effort. Ben's projects are not automatically pluralistic public-policy problems: bounded engineering questions often do have checkable answers. Using wickedness as an excuse to avoid delivery or tests would be a category error. Owner-chosen limits remain necessary.

**Grade:** Conceptual. **Read:** Part: goal formation, problem definition, first wicked-problem characteristics including stopping and evaluation. [Dilemmas in a General Theory of Planning](https://urbanpolicy.net/wp-content/uploads/2015/06/Rittel-Webber_1973_DilemmasInAGeneralTheoryOfPlanning.pdf).

### 14. Kahneman and Klein: when to trust expertise (2009)

**Problem:** confidence is mistaken for calibrated skill. The authors argue that predictable cues plus opportunities to learn from valid feedback matter, and discuss both the value and limitations of algorithms. **Transfer:** demand evidence of successful comparable work or a direct test when judging an agent's confident design claim; do not make owner approval substitute for technical evidence. **Cost/failure:** obtaining representative feedback; novel project choices may lack it. My inference: giving agents more context is not equivalent to longitudinal learning from outcomes. Simple scoring formulas are also unjustified without reliable criteria and comparable cases.

**Grade:** Conceptual research synthesis drawing on controlled and observational studies, not a new controlled test of these recommendations. Underlying studies were not independently audited here. **Read:** Part: origins, expertise discussion, algorithm comparison, premortem, conclusions. [Conditions for Intuitive Expertise](https://bear.warrington.ufl.edu/brenner/mar7588/Papers/kahneman-klein-2009.pdf).

### 15. Klein: premortem (2007)

**Problem:** commitment suppresses objections until failure is expensive. Participants independently imagine failure and identify reasons before revising the plan. **Transfer:** at consequential investment decisions, elicit a few distinct ways the investment could fail, then test the most discriminating uncertainty. **Cost/failure:** small initial time cost, potentially large mitigation tail. Unranked imagined risks can generate endless safeguards and pessimism. The article cites an improvement in generating reasons from prospective hindsight; that is not evidence of a corresponding reduction in actual project failures, and the underlying experiment was not read. A premortem cannot replace direct evidence.

**Grade:** Experience + conceptual, with cited experimental antecedent unverified. **Read:** Full short article transcription. [Performing a Project Premortem](https://lmscontent.embanet.com/USC/PPD554/Week10/PPD554_W10_HBR_Klein_Performaing_a_Project_Premortem.pdf).

## Supplementary and limited readings

**Cynefin:** Different contexts call for different decision styles; misclassification and habitual responses can fail. [Snowden and Boone](https://hbr.org/2007/11/a-leaders-framework-for-decision-making?tpcc=orgsocial_edit). Grade: conceptual/experience. Read: Part of the [primary article mirror](https://strategicleadership.com.au/wp-content/uploads/2017/06/A-Leader%E2%80%99s-Framework-for-Decision-Making-HBR-Nov-2007.pdf), through discussion of complicated contexts. My assessment: potentially useful for choosing between analysis and probing, but classification itself needs judgment; adopting its vocabulary adds cost. I do not count it among the 15 retained method texts or infer causal efficacy.

**Hickey:** The [InfoQ Simple Made Easy page](https://www.infoq.com/presentations/Simple-Made-Easy/) exposes timestamped editorial notes rather than a complete author transcript in this retrieval. Read: Part, notes through approximately the first half; video not watched. The easy-versus-simple distinction is relevant, but these notes are not counted as a substantively read primary text. No endorsement of functional programming as the answer to Ben's project problems follows from them.

## Unverified / not used as method evidence

- Toyota set-based concurrent engineering: [Sobek, Ward, and Liker primary PDF](https://www.researchgate.net/profile/Jeffrey-Liker/publication/248139929_Toyota%27s_Principles_of_Set-Based_Concurrent_Engineering/links/54d0dfb60cf20323c21a0069/Toyotas-Principles-of-Set-Based-Concurrent-Engineering.pdf) opened but text extraction returned only cover information. Screenshot calls returned references without visible page images in this tool output. Status: cover/snippet, not substantive reading. The [publication abstract record](https://dialnet.unirioja.es/servlet/articulo?codigo=2479221) identifies field data collection; I did not verify its measures or causality. No claim that parallel agent proposals reproduce Toyota's method.
- Gause/Weinberg: [author's book page](https://geraldmweinberg.com/Site/AYLO.html) found in search only. Status: snippet; no chapters read. Its problem-discovery reputation is not treated as evidence here.
- Beck: XP addressed through Fowler's primary analysis; Tidy First? and XP books were not substantively read. Search surfaced author/promotional material and reviews, insufficient to grade the book's method independently. No claim to have evaluated the book.
- Premortem's prospective-hindsight experiment: cited by Klein and Kahneman/Klein, not independently retrieved or audited.

## What would actually discriminate the options for Ben

The following are my synthesis and suggested tests, not findings from a trial:

1. **Find the investment error before selecting a method.** Reconstruct one useful delivery and one failure using their original user outcome, largest uncertainty, actual decision point, and resulting burden. The permitted problem statement alone cannot establish whether poor framing, coordination, architecture, or execution was dominant.
2. **Use one real outcome to compare the workflow with its baseline.** Record whether the user can finish the intended task, owner attention and interruptions, recurring operational steps, escaped failures, and useful capability delivered. Count artifacts only as costs or aids, never as the outcome. Existing evidence may suffice; do not build a measurement product first.
3. **Make a redesign claim concrete.** Name the recurring failure class; show the dependency or state-ownership error that predicts it; identify a bounded replacement and a user-observable acceptance check. Preserve known safeguards until their purpose is either retained or explicitly judged unnecessary.
4. **Include a retirement test.** A simplification that leaves the old route, new route, adapter, and synchronization obligations indefinitely active has not yet demonstrated reduced burden.
5. **Cap inquiry as well as implementation.** End research when another cheap observation is unlikely to change the investment choice. More competing essays from the same model are not independent evidence.

A bounded redesign is warranted when repeated failures have a demonstrated shared structural cause and a tractable replacement boundary. A rewrite becomes dangerous when its justification is primarily dissatisfaction, line count, or the promise that a fresh model will be clean; when existing behavior is poorly known; or when value depends on a distant all-at-once cutover. Conversely, retaining a fundamentally wrong state model because every individual patch looks cheap can be more expensive than replacement. None of the reviewed texts eliminates that judgment. The discriminating evidence is a functioning slice with fewer recurring obligations and preserved required behavior.

## Scope and gaps

Fifteen retained primary texts were substantively read, many only in part; two supplementary readings and explicit unverified items are separated above. There is no claim of exhaustive book coverage, a systematic literature review, or controlled validation of any combined method for agent-assisted development. Toyota set-based design and Beck/Gause/Weinberg books remain the most material coverage omissions. No repository code, tests, builds, commits, identities, or peer messaging were changed. Only this report was written.
