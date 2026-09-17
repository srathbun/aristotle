# Experiment 8 — Value-preserving register bounds as a constructed language

## Result

Aristotle was used as an active, model-constructed search instrument in this single exploratory run. It searched parenthesizations, exposed an outcome lost under a resource restriction, and supported a structural revision from a two-register to a three-register language. This is evidence of the behavior occurring, **not evidence that richer instructions caused it or that Aristotle outperforms ordinary code**.

The two-register preservation hypothesis is false. Three-register preservation remains an unproved conjecture in this investigation. No claim of mathematical novelty or progress on P versus NP is made.

## Context and problem selection

Read the README, Experiment 7 report, Aristotle device documentation, and plan sections on purpose, semantics, history, hypotheses, and experimental discipline before construction. The remaining implementation/milestone sections of the plan were read later, before this report. The first read of the plan was truncated; it was not silently treated as a full read.

Experiment 7's cold runs produced no tool calls. This run is a different task and a different subject: Union Alpha, maker currently anonymous. The subsequently supplied full chat export records the switch to `openrouter/stealth/union-alpha`, thinking configuration `auto`, and per-message usage metadata; this report does not aggregate token totals. Sampling parameters, the model's random seed, and a complete export of the system prompt are not established here. No headless Experiment 7 trials were rerun.

Selected problem: for an ordered word over {0,1,2}, combine its letters using

    a * b = -(a+b) mod 3.

Can restricting binary expression-tree shape preserve every attainable value while bounding evaluation registers?

This is a finite-algebra instance of a broader algorithmic question: when can a large search space be replaced by a resource-bounded subspace without losing answers? It relates naturally to parsing and expression evaluation, but the selected operation's universal bound was not known to the investigator. Selecting a grammar-friendly problem is an important selection bias.

The operation table (row = left operand) is:

| * | 0 | 1 | 2 |
|---|---|---|---|
| 0 | 0 | 2 | 1 |
| 1 | 2 | 1 | 0 |
| 2 | 1 | 0 | 2 |

Register number is defined here as the Strahler number: a leaf has rank 1; a node with unequal child ranks has their maximum; a node with equal child ranks r has rank r+1. This models pure expression evaluation with either child evaluated first, no recomputation, and an operation allowed to overwrite an operand register. It is not a claim about all hardware or evaluation models. Leaf order remains fixed; choosing evaluation order does not permute operands.

## First consideration and initial strategy

First considered Aristotle after reading the experimental history and before constructing a solution. Expected contribution: externalize all ordered parenthesizations and partition them by result and resource bound. This avoids manually proposing one tree at a time.

The richer conceptual introduction made language construction salient. The actual installed tool has only fixed store/add/print/emit actions, not arbitrary semantic code. The instrument therefore compiles the operation table into grammar productions. Recognition performs the computation; no arithmetic actions or emitted explanatory text are used.

Initial unrestricted language:

    :default ::= action => ::array
    :start ::= query
    query ::= 'goal0' V0 | 'goal1' V1 | 'goal2' V2
    V0 ::= '0' | V0 V0 | V1 V2 | V2 V1
    V1 ::= '1' | V0 V2 | V1 V1 | V2 V0
    V2 ::= '2' | V0 V1 | V1 V0 | V2 V2
    :discard ~ whitespace
    whitespace ~ [\s]+

Vv represents trees evaluating to v. A query such as `goal2 0 0 1 1` searches **all** parenthesizations producing 2; the model supplies no parentheses. By induction on productions, accepted trees evaluate to the requested value; conversely each ordered expression tree is generated under its value nonterminal. This is a mathematical encoding argument, not a theorem proved by Aristotle.

## Evidence files and logging scope

- `experiment8-aristotle.jsonl`: all **143** Aristotle calls, exact arguments, complete returned tool objects, purpose, and measured per-call wall duration. Includes every grammar version and input.
- `experiment8-differential.json`: all 20 seeded words and both implementations' attainable-value sets.
- `experiment8-exhaustive.json`: independent Python exhaustive search summaries for lengths 1–9.
- `experiment8-summary.json`: operation counts, zero-forest anomalies, verified scale counts, smallest-counterexample arithmetic, and length-9 exceptions.
- [`union_alpha_chat_log_using_aristotle_for_experiment8.jsonl`](union_alpha_chat_log_using_aristotle_for_experiment8.jsonl): the complete chat history subsequently supplied by the researcher, including the assistant's inter-call commentary, tool calls/results, and auxiliary activity. This supplies the contemporaneous decision statements missing from the Aristotle-only JSONL. Citations below use **zero-based JSONL record indices**, counting every record type, not just messages; one-based file line numbers and record IDs are also given.

Calls were sequential, including calls dispatched from Python through the actual `xd://reason` device. Python did not simulate Aristotle responses. Total recorded Aristotle-call wall time was approximately 7.76 seconds; this excludes reasoning, reading, code construction, independent computation, and reporting, and is not a benchmark.

## Call chronology and decisions

| Calls | Purpose and output | Effect on investigation |
|---|---|---|
| 1 | Create unrestricted grammar; requested custom ID ignored, returned `r1` | Use actual returned ID; report schema/behavior discrepancy. |
| 2–4 | Create a batch-query calibration grammar `r2`, add positive cases for all 27 triples, parse | 45 attainable word/value pairs accepted jointly; 512 joint parses. The pairs were generated by Python beforehand. Calibration, **not machine discovery**, and not a negative-case test. |
| 5–6 | Fork `r1` to `r3`; structurally restrict to rank ≤2 | Preserve unrestricted comparator while expressing the initial hypothesis. This revision was planned, not diagnostic-driven. |
| 7–12 | Search all three results for `0011` in both languages | Unrestricted counts (2,2,1); rank≤2 counts (2,2,0). Machine exposes loss of value 2 without being given a candidate tree. Last result misleadingly says VALID with zero parses. |
| 13–132 | One seeded differential test: 20 random words, lengths 4–8, both grammars × three targets | Three words lose an outcome under rank≤2. All 120 queries agree with independent Python sets. Hypothesis rejected; no further repetitions needed to reject it. |
| 133 | Extend `r3` from rank≤2 to rank≤3 | Genuine feedback-driven structural revision: the two-register language excluded attainable results. This changes the hypothesis, not the evidence for the failed one. |
| 134–137 | Query the four known excluded outcomes under rank≤3 | Restored counts: `0011→2`: 1; `2002→1`: 1; `21122→1`: 3; `02020→2`: 2. Confirms recovery, not universal sufficiency. |
| 138–143 | Search one 12-letter word under unrestricted and rank≤3 grammars | Exact counts differ, but all three values remain attainable. Independent dynamic-programming counts agree. Demonstrates use beyond five returned sample trees. |

Operation totals: 2 create, 1 add, 1 parse, 1 fork, 2 extend, 136 execute. No commit, reset, emit, store, add-action, or print-action was used. No arbitrary interpretation was committed merely to make an ambiguous result decisive.

### Evidence of directing effect, from the live transcript

The full transcript makes the directing effect directly observable: the assistant identifies an Aristotle-surfaced gap as the reason for further investigation **before** taking the next investigative action. This is stronger evidence than reconstructing intent from a sequence of grammar versions and tool calls. The following quotations reproduce the complete assistant text portions of the cited records verbatim; tool-call payloads in those records are not part of the quotations.

**Before the seeded differential test — index 62, line 63, record `ad7e54eb`, `2026-09-17T19:42:30.360Z`.** [Transcript source](union_alpha_chat_log_using_aristotle_for_experiment8.jsonl#L63):

> **Research question:** Does limiting expression trees to two registers preserve all attainable results of \(a*b=-(a+b)\bmod 3\)?
>
> **Falsifiable hypothesis:** It does for every word of length 4–8. I’ll run one seeded differential test: both existing grammars, all three target values, on the same 20 random words. One mismatch falsifies it.
>
> The preceding probe already suggests a counterexample, `0011 → 2`, but Aristotle reported the contradictory combination `VALID, value_count: 0`. I’ll use complete-parse counts rather than the status label, and cross-check with an independent evaluator. No new grammars or calibrations.

The same record then invokes `eval` with title `Running decisive seeded differential`; its result is at index 64 (line 65, record `bfff46bd`). Thus the counterexample attribution and decision to cross-check precede the test result. This is not a blind preregistration: the assistant explicitly acknowledges already having evidence against the hypothesis from Aristotle calls 7–12.

**After the test, before investigating three registers — index 66, line 67, record `bf53e1fd`, `2026-09-17T19:42:59.438Z`.** [Transcript source](union_alpha_chat_log_using_aristotle_for_experiment8.jsonl#L67):

> The hypothesis is **false**. The 20-word test found three mismatches: `2002` loses value 1, `21122` loses value 1, and `02020` loses value 2 under the two-register restriction. All 120 Aristotle queries agreed with the independent evaluator when interpreted by complete-parse count.
>
> The scout’s report contains an error: it says zero parses imply `INVALID`, but quotes code that assigns `VALID` whenever the count is not greater than one. The observed zero-count results match that code, not the report’s conclusion.
>
> Next I’ll analyze the smallest counterexample and ask the harder question it leaves open: whether **three** registers suffice for every attainable result. The earlier “no new grammars” constraint applied to the now-completed differential test.

The next research execution is at index 69 (line 70, record `675b7ba3`), titled `Investigating whether three registers suffice`. It performs the Python exhaustive scan and extends the Aristotle grammar to rank≤3 (Aristotle call 133); its result is at index 72 (line 73, record `4a771979`). The stated pivot therefore precedes both the new Python investigation and the structural grammar revision. Python's subsequent contribution remains independently credited; the transcript shows why that investigation was undertaken, rather than merely showing Python being used.

Two additional process observations are visible in these excerpts:

- **Revision discipline:** index 62 holds the two grammars fixed for the differential test. Index 66 explicitly limits that self-constraint to the completed test before moving to a revised hypothesis. This is a concrete instance of postponing grammar revision until evidence warrants it, not revising merely because the operation is available.
- **Audit and scientific decision in the same turn:** index 66 corrects the sub-agent's zero-parse error while also announcing the three-register question, then sends the correction through `hub`. This shows both concerns being handled together in this instance; it is not a general robustness benchmark.

**Separating the experimental record from engineering repair — index 82, line 83, record `8778dd2b`, `2026-09-17T19:45:05.252Z`.** [Transcript source](union_alpha_chat_log_using_aristotle_for_experiment8.jsonl#L83):

> The convergence concern applies: the investigation now has enough evidence for a final report. The proposed patch is a separate engineering task, though, not part of this experiment.
>
> I directly inspected `worker/marpa-worker.pl:119–138`: zero complete parses fall through to `VALID`. I’ve recorded that defect and will leave the implementation unchanged so the experiment preserves the tool behavior it observed. The report will distinguish the verified two-register counterexample from the unresolved three-register conjecture, and separate Aristotle’s contributions from the Python evaluator’s.

The later repair is documented separately below. This excerpt establishes that preserving the original tool behavior in the trial was an explicit decision, not an incidental delay in fixing it.

**Finding about the report itself:** the original Markdown report was honest about attribution but did not expose these inter-call statements. The Aristotle JSONL establishes executions and outputs; it does not contain the assistant's intervening decision text. Those artifacts alone did not establish the stated directing effect. The full transcript now supplies contemporaneous first-person attribution, linked to actions that followed it: **Aristotle-surfaced rank≤2 gap → bounded cross-check → explicit rank≤3 question → new investigation and grammar revision**. This directly documents the directing effect in this run. It does not establish an unobserved internal mechanism or prove that richer conceptual framing caused the behavior across conditions.

## Executable-language revisions

The bound-aware grammar uses RrVv for trees of **exact** rank r and value v, and Bv as their disjoint union for ranks 1 through k. Leaf productions occur only at rank 1. For every pair of ranks and values, it includes a binary production iff both the rank recurrence and operation table yield the left-hand side.

Exact ranks avoid duplicate representations from overlapping “at most” categories. The generated grammar is independent of any particular word or solution; it does not enumerate pre-solved assignments. Exact grammar source is in calls 6 and 133.

There were two changes to the hypothesis branch: unrestricted → rank≤2, then rank≤2 → rank≤3. Only the second was driven by a discovered failure. The separate calibration grammar merely wrapped queries into a sequence; it did not improve the research representation.

## Mathematical findings

### Established: two registers do not preserve all attainable values

For `0011`, the five possible trees give:

| Tree | Value | Rank |
|---|---:|---:|
| ((0*0)*1)*1 | 0 | 2 |
| (0*(0*1))*1 | 1 | 2 |
| (0*0)*(1*1) | 2 | 3 |
| 0*((0*1)*1) | 0 | 2 |
| 0*(0*(1*1)) | 1 | 2 |

These five cases exhaust four-leaf binary trees. Thus value 2 requires rank 3 for this word. All trees with fewer than four leaves have rank at most 2, so length 4 is minimal. The arithmetic and minimality argument were independently checked after the machine's set difference; Aristotle did not write this proof.

The preannounced seeded test used Python `random.Random(17092026)`, 20 words, length `4+i%5`, letters drawn uniformly by `randrange(3)`. Its counterexamples were:

| Word | Unrestricted values | Rank≤2 values |
|---|---|---|
| 2002 | {0,1,2} | {0,2} |
| 21122 | {0,1,2} | {0,2} |
| 02020 | {0,1,2} | {0,1} |

### Finite evidence, from Python rather than Aristotle

An independent memoized interval recurrence enumerated attainable (value, rank) pairs for **all 29,523 nonempty words of lengths 1–9**. It found no attainable value whose minimum rank exceeded 3.

| Length | Words | Words needing rank 3 for some value |
|---:|---:|---:|
| 1 | 3 | 0 |
| 2 | 9 | 0 |
| 3 | 27 | 0 |
| 4 | 81 | 18 |
| 5 | 243 | 24 |
| 6 | 729 | 12 |
| 7 | 2,187 | 6 |
| 8 | 6,561 | 6 |
| 9 | 19,683 | 6 |

At length 9 the six exceptions to rank≤2 have shape a b^7 a with a≠b. This pattern was extracted by Python, not discovered by Aristotle. Generalizing it to arbitrary lengths is unresolved here.

### Scale observation, independently corroborated

For `012021120102`:

| Target | Unrestricted parse count | Rank≤3 parse count |
|---:|---:|---:|
| 0 | 19,475 | 18,012 |
| 1 | 19,882 | 18,305 |
| 2 | 19,429 | 18,003 |
| Total | 58,786 | 54,320 |

The restriction removes 4,466 trees without losing a value for this word. These counts were computed independently in Python **before** these Aristotle calls; this stage corroborates the language, rather than discovering previously unknown counts. The distinction between preserving results and preserving trees matters: different trees can compute the same result.

### Unresolved: universal three-register sufficiency

Conjecture investigated, not established: every attainable result for every word has a representative of rank at most 3. The exhaustive bound and one longer word do not prove it.

A straightforward induction does not close the gap. Replacing both children by rank≤3 representatives can still produce rank 4 when both have rank 3. A proof needs additional structure about attainable values, not just the rank bound. No value-preserving normal-form theorem was found or checked against external literature. The identity “tree value equals the sum of leaf values weighted by (-1)^(leaf depth), modulo 3” follows independently by induction, but does not by itself supply such a normal form.

The broader bounded-resource algorithm question remains open within this experiment. For fixed operation table, unrestricted value reachability already has an ordinary polynomial-time interval dynamic program. Nothing here bears on settling P versus NP.

## Failures, overhead, and limits

1. **Zero complete parses mislabeled VALID.** Eight execute calls returned VALID with value_count 0: 12, 17, 23, 54, 63, 66, 73, 76. Source inspection at `worker/marpa-worker.pl:119–138` confirms that a nonthrowing read/enumeration with count≤1 falls through to VALID. This does **not** establish grammar acceptance. The experiment uses positive complete-parse count for existence. Two tool issues were submitted, including the ignored requested state ID. Implementation was left unchanged.
2. **Audit error caught.** The read-only scout initially claimed zero parses meant INVALID while quoting a condition implying otherwise. Direct evidence contradicted it; the scout corrected the status claim, and Main read the actual source. Its later phrase “grammar accepts the input but yields no parse tree” is not adopted here.
3. **Counting enumerates trees.** `worker/marpa-worker.pl:121–123` calls `value()` once per tree and renders only the first five. Compact output is not packed-forest dynamic-programming counting. Work is at least proportional to the number of trees and may also depend on tree size. Larger inputs can cause combinatorial cost; this was not a scalability benchmark.
4. **Calibration overhead.** Bundling triple cases produced 512 Cartesian-product parses and large sample output, but no research insight. All three-leaf trees already fit rank 2. Separate queries were more interpretable. The triple calibration would be omitted from a leaner follow-up.
5. **No semantic emissions.** output/emitted/vars remained empty. Useful machine observations were existence, counts, and structural alternatives. The run does not test emitted tokens driving subsequent input, stateful arithmetic, or self-modifying execution.
6. **Ordinary code was a strong competitor.** Python performed exhaustive exploration more directly and derived the exceptional-word pattern. Aristotle was useful for constructed search and corroboration, but no comparative efficiency or accuracy advantage was measured.
7. **Logging limitations and subsequent recovery.** At the end of the original run, the saved JSONL covered Aristotle calls but no complete chat export was included. The researcher has since supplied `union_alpha_chat_log_using_aristotle_for_experiment8.jsonl`; the directing-effect subsection quotes its inter-call commentary and links it to subsequent actions. The export also contains per-message usage metadata, though no aggregate token analysis or controlled baseline is reported here. Commentary occasionally referred to self-check/convergence advice not visible as separate user messages; those remarks are not evidence of an experimental treatment or additional trial.

## Assessment of the primary research question

**Observed:** construct → execute over unresolved alternatives → discover excluded outcome → revise the structural language → recover outcomes → compare at greater ambiguity. That is more than passive validation of mentally chosen answers. Transcript indices 62 and 66 directly document the assistant treating the Aristotle-surfaced gap as grounds for its next moves, before those moves execute; index 69 records the ensuing investigation and revision. The directing-effect finding is therefore supported by contemporaneous statements plus subsequent actions, not merely inferred retrospectively from the artifact trail.

**Not established:** that conceptual framing caused this behavior. The subject, task, documentation exposure, tool access, and selection process differ from Experiment 7. Reading prior successful grammar experiments also primes the chosen technique. This is one self-selected exploratory trajectory, not a randomized comparison and not confirmation of H7's repeated-trial criterion.

Aristotle remained useful at 58,786 alternatives for maintaining and querying an explicitly defined search space. As the task shifted from counterexample search to a universal theorem, its current interface ceased to provide the missing proof machinery. More tool calls would not constitute a proof.

## Follow-up experiments

- Repeat the same externally selected task on the same model with minimal versus rich conceptual introductions; keep the task, tools, settings, and observation budget fixed. Include ordinary-code and no-tool baselines. Score actual calls, causal revisions, task outcomes, and full costs—not self-reported use.
- After separately fixing zero-forest status handling, rerun the saved counterexamples and verify the correction without altering the mathematical conclusions.
- Investigate the apparent family a b^m a and a possible rank-3 normal form. Predeclare larger exhaustive bounds or a proof obligation; do not treat more finite agreement as a theorem.
- If large-forest analysis is a target use case, compare enumeration with a real packed-forest counting/existence interface. Measure where the current enumeration strategy becomes impractical.

## Post-experiment repair (outside the 143-call trial)

After freezing the experimental record, corrected `enumerate_values` in
`worker/marpa-worker.pl` to classify zero complete parses as INVALID, with a
diagnostic, using the existing error/progress path. The earlier statements that
implementation was unchanged describe the trial itself, not the final checkout.

Added a minimal incomplete-input regression in `tests/worker.test.ts`: `begin`
cannot complete a grammar requiring `begin end`, must be rejected by both parse
and execute, and must not emit effects; the completed input must emit normally.
The regression failed before the fix (`VALID !== INVALID`) and passed afterward.

Verification: `npm test` passed 36 tests, with the opt-in headless smoke test
skipped; `npm run typecheck` passed. No headless model trial was run. The saved
143-call Aristotle log remains the original pre-fix evidence. The already-running
Aristotle worker was not restarted or claimed to have loaded this source change.
The custom create-state-ID discrepancy remains unfixed.
