# Experiment 10 — Aristotle as a research instrument, not a proposed SAT solver

## Result and scope

The researcher corrected Experiment 9's framing: use Aristotle to explore research alternatives, provisional assumptions, discriminating experiments, and possible next steps—not necessarily as an algorithm that solves P versus NP.

This run explored a possible **residual-merging research program**. Aristotle searched for counterexamples to provisional equivalence claims. Its returned witnesses then supplied new experiments against other claims. The observed loop was:

> propose a merge from limited observations → search for a distinguishing continuation → use the returned continuation to discriminate other hypotheses → preserve the broader direction while rejecting a particular guess.

There were **14 Aristotle calls**. Two nontrivial witness searches produced four counterexamples each. One machine-found witness eliminated 20 of 100 surviving merge guesses; a second eliminated another 9. This supports a narrow finding about research guidance in this run. It is not a result about P = NP, a new SAT algorithm, or a demonstrated advantage over ordinary code.

## Research question and competing interpretations

For a CNF formula F and partial assignment a, let F|a be the residual problem. Could a search algorithm merge many such residuals while preserving the answer? “Same remaining problem” has distinct interpretations:

1. **Same syntax:** identical residual clause representation. This is sufficient but may distinguish logically equivalent residuals.
2. **Same Boolean function:** every continuation assignment has the same truth value. This permits substitution under later constraints over the same remaining variables.
3. **Same satisfiability:** both have some satisfying continuation, or neither does. There are only two such classes, but identifying the class already requires deciding satisfiability. Moreover, this equivalence does not permit arbitrary future constraints to be imposed after a merge.

Two obligations for a dynamic-programming approach must remain separate: a small number of retained classes, and an efficient, sound way to recognize when a merge is allowed. To obtain a polynomial SAT algorithm, one would additionally need a uniform polynomial bound on constructing and processing all intermediate representations. Merely assuming a small number of classes does not close these gaps.

These definitions and implications were supplied by the assistant. Aristotle did not discover or prove them.

## Instrument design

### Research ledger

A small grammar accepts records with `assume polyclasses` or `open polyclasses`, evidence labels `finite` or `none`, a next research action, and a `conditional` conclusion. It rejects replacing that conclusion with `theorem`.

This is deliberately weak machinery: it enforces a reporting policy supplied by the assistant. It does not check natural-proofs, relativization, or other complexity-theoretic barriers; it does not verify evidence or recognize mathematical truth. The initial todo's “barrier sieve” means only this limited guard against unsupported promotion. Calling it a general proof-obstruction detector would be false.

The ledger was extended after a counterexample to permit `refuted samplemerge ... conclusion routeopen`: a particular guess can fail without closing the entire research approach. That extension preserves uncertainty rather than deleting a failed hypothesis.

### Distinguishing-continuation search

For two CNFs A and B on the same n variables, the generated grammar accepts the masked input

    ? ? ... ? end

once for each assignment w for which A(w) differs from B(w).

A state contains a variable position and each formula's still-unsatisfied clause indices. Each branch assigns the next variable and removes newly satisfied clauses. A terminal state accepts `end` exactly when one formula has all clauses satisfied and the other does not. Otherwise it expects `reject`, which is never supplied. States are generated from transitions, not from a precomputed list of full distinguishing assignments.

False is rendered as `(?)`; true has an additional unary wrapper, `((?))`. This permits decoding returned S-expressions into assignments even though the default renderer does not retain nonterminal names.

This instrument performs finite counterexample search. It can grow exponentially and the current Aristotle runtime enumerates complete parses. It is **not** a proposed polynomial-time equivalence algorithm. Its research use is to test a conjectured merge and supply a concrete next probe.

## Pre-execution expectations and controls

The commentary before construction distinguished supplied expectations from possible discoveries:

- Different syntax need not imply different functions.
- Equisatisfiability need not imply substitutability under future restrictions.
- Finite agreement can justify investigating a conjectured merge, not certifying it.
- A guess can be used conditionally without being promoted to a theorem.

Calls 1–3 constructed the ledger, accepted a conditional assumption, and rejected theorem promotion. Calls 4–7 tested two chosen controls:

| A | B | Aristotle distinguishing assignments | Meaning |
|---|---|---:|---|
| x | x AND (x OR y) | 0 | Different syntax, equal function |
| x | y | 2: 01 and 10 | Both satisfiable, unequal functions |

These were anticipated controls, not insights discovered by the machine. They motivated keeping semantic equivalence distinct from both syntactic identity and bare satisfiability.

## Provisional guess and first counterexample search

The next research idea was to **propose** merges when residuals agree on sparse probes, then actively seek counterexamples. Initial probes were the all-zero assignment and the six unit vectors: seven continuations total.

Using Python `random.Random(1010)`, the assistant generated a six-clause base formula A and an extra clause C. Selection used only agreement on these seven probes and required at least one positive probe. The first generated candidate qualified. It was not exhaustively checked before the Aristotle call.

Signed integers denote literals. The base was:

    (-6 OR 5 OR 2)
    AND (4 OR -2 OR -5)
    AND (6 OR -5 OR 3)
    AND (-4 OR -5 OR 3)
    AND (-6 OR -2 OR -5)
    AND (-4 OR -1 OR -5)

The extra clause was `(5 OR -6 OR -1)`. The provisional merge was A with A AND C. Both had initial probe signature `[true, true, true, true, true, false, false]`.

Calls 8–9 constructed a 61-state separator grammar and executed it. Aristotle returned exactly four distinguishing continuations:

    110101
    110001
    111101
    111001

Each makes A true and A AND C false. All lie outside the initial probes. The assistant decoded the machine output, then independently evaluated both CNFs on those witnesses. The particular witness set came from Aristotle, not from a preceding exhaustive Python computation.

## Evidence of directing effect

Immediately after call 9, before choosing or evaluating the next research probe, the assistant stated:

> That changes the research plan. Agreement on the sparse sample is not grounds for an exact merge, but the failures supply **new probes**. I’ll test whether one of these machine-found continuations separates many other candidate merges that the original sample could not distinguish.

This decision was followed by a concrete discrimination calculation. The assistant formed all 160 signed three-literal clauses using distinct variables from the six-variable vocabulary. Each clause D defines a candidate assertion that A and A AND D can be merged. One hundred assertions survived the original probes.

Python scored the four Aristotle-generated witnesses against those 100 assertions:

| Machine witness | Surviving guesses refuted |
|---|---:|
| 110101 | 17 |
| 110001 | 13 |
| 111101 | 20 |
| 111001 | 17 |

The selected probe was **111101**, best among these four—not claimed globally optimal. It left 80 candidate assertions. The arithmetic and selection policy were Python's contribution; the candidate probes were Aristotle's output.

This is the directing effect sought in the reframed experiment: an observed counterexample determines what experiment to perform next, rather than being logged merely as a final pass/fail result.

## Representation revision and remaining ambiguity

Calls 10–12 addressed a real ledger limitation: its original schema could not record local refutation while retaining an open research route. The new record was rejected at `refuted`; the assistant installed a complete revised grammar and the same record was accepted. The witness was recorded as evidence for a local failure, not for impossibility of all residual-merging algorithms.

The need for this revision was recognized by the assistant before trying the new input; the INVALID result confirmed the schema limitation. It was not an unexpected mathematical discovery by the parser.

From the remaining 80 assertions, the assistant chose the first extra clause not syntactically identical to an existing base clause, without exhaustively testing it. This clause was `(-1 OR -2 OR 3)`.

Calls 13–14 built a 60-state separator grammar and returned four more counterexamples:

    110100
    110101
    110000
    110001

They all lie outside the improved probe set. Thus surviving one counterexample-guided refinement still does not establish equivalence. The result preserves a distinction between “not yet refuted” and “proved mergeable.”

## Final independent verification and discrimination limits

Only after both searches, Python enumerated all 64 continuations. Both complete distinguishing-assignment sets matched Aristotle's returned sets exactly.

A final scoring of the second witness set selected `110001`, which refuted 9 more assertions. This witness had also appeared in the first search; the second search did not discover an entirely new collection of probes. The new information was that another previously surviving merge had counterexamples, including witnesses already available but not selected in the first round.

| Stage | Remaining candidate assertions |
|---|---:|
| All possible added clauses | 160 |
| After original seven probes | 100 |
| After machine-derived probe 111101 | 80 |
| After probe 110001 | 71 |
| Actually equivalent, exhaustive post-check | 8 |

All eight true equivalences survived. However, 63 false guesses remained after the two added probes. The intervention was useful for discrimination, but weak as a certificate. This is a result worth retaining rather than treating 100→80→71 as automatic evidence of a successful scalable algorithm.

## What follows for research on P versus NP

The useful continuation is not “prove P = NP by sampling residuals.” Sampling cannot certify all continuations merely because a finite selection agrees. Instead, the experiment separates research questions that can now be asked precisely:

- Can particular structural families admit few residual equivalence classes with inexpensive certificates of safe merging?
- Can machine-found distinguishing continuations guide a more informative probe-selection policy than fixed sparse probes?
- Can local counterexamples expose missing features in a proposed residual summary?
- What bounds on number of classes, certificate cost, and number of refinements would be necessary before this became an algorithmic complexity result?

A conditional working assumption that classes are few lets these questions be explored, but does not assert that the assumption holds for general SAT. The experiment leaves both P = NP and P ≠ NP untouched. No general proof barrier or new mathematical theorem was established.

## Attribution, dead ends, and limits

- The assistant chose the research program, meanings of equivalence, control cases, sample, and scoring policy. Those were not parser discoveries.
- The ledger's rejection of theorem promotion is a programmed policy and would be redundant with disciplined prose. Its use alone would be a weak result.
- The substantive machine contributions were the two sets of distinguishing continuations, subsequently used and independently checked.
- Grammar revisions were limited: the research ledger was extended; the separator algorithm was not revised, only instantiated for different hypotheses. No revision was forced merely to demonstrate an evolving grammar.
- The grammar represents assignments during a **counterexample experiment**, not as a proposed polynomial reduction from SAT. This is why using finite assignment search here does not repeat Experiment 9's central claim.
- There is no pure-model, ordinary-code, or fixed-probe comparison of overall time or accuracy. General usefulness or efficiency is not established by this single case.
- No semantic emit/store/add/print effects were used. INVALID and AMBIGUOUS structure supplied the useful observations.
- The live worker still reports VALID on empty fragments during extension (call 11), despite the source repair after Experiment 8. That status is not used as evidence of grammar acceptance or theorem truth. Nonempty experiment queries are evaluated by complete-parse counts, with independent checks.
- Early commentary about “self-check” and “convergence” is not a claim of an additional user instruction or an extra experiment. The actual research decisions and calls are recorded below.
- The earlier Experiment 9 report contains overstatements not adopted here: its exact formula counts state nonterminals, not total grammar bytes; its so-called min-fill routine is a minimum-current-degree elimination heuristic, not a clause reordering; treewidth is a graph invariant, unlike an ordering's induced width. Its numerical formula check covers ten saved instances plus the separate boundary example, not thirteen. These are reasons to avoid importing that report's strongest language about general impossibility. No such claim is needed for this experiment.

## Audit artifacts

- `experiment10-aristotle.jsonl`: all 14 exact calls, complete returned objects, and purposes. Calls 1–3: ledger; 4–7: controls; 8–9: first search; 10–12: ledger revision; 13–14: second search.
- `experiment10-decisions.json`: decision notes indexed by preceding Aristotle call. These are concise notes; the contemporaneous commentary remains in the conversation transcript.
- `experiment10-results.json`: formulas, original probes, witness sets, scores, selected probes, remaining-candidate counts, and independent verification statement.

No production implementation was changed. The experiment's deliverable is a research trajectory supported by executed counterexample searches, not a SAT solver or a resolution of P versus NP.

## Post-experiment live worker reload

The zero-forest fix already present in `worker/marpa-worker.pl:127–128` was
verified in the live tool after restarting this session's worker. Process
inspection identified its command as the repository's Perl worker and its parent
as this session's host; a worker belonging to another host was left untouched.

With a grammar requiring `begin end`, live `execute` on `begin` now returns
**INVALID, value_count 0**, with no emitted effects and the diagnostic
`Input has no complete parse`. `begin end` returns **VALID, value_count 1** and
emits `begin`. Parsing an empty fragment stream and extending an empty state
with that grammar also return INVALID. The original 14-call experiment log was
not modified.

`npm test` passed 36 tests, including the existing incomplete-input regression;
the opt-in headless smoke test was skipped. No additional source change was
needed: the running process had not loaded the earlier fix.

Two separate observations remain outside this fix: `inspect` can display a
historical cached VALID/zero result until reparsing, and the first automatic
`create` after state restoration collided with existing ID `r1`. A uniquely
named fork isolated the verification without overwriting experimental states.
Neither issue changes the now-verified classification of fresh parses.
