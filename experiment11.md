# Experiment 11 — Residual-merge discrimination across base structures

## Finding

Counterexample-guided discrimination transferred to several base structures, but its utility varied. It substantially outperformed the mean fixed-seed random baseline on the implication-chain and parity instances. The Horn instance showed a smaller benefit; four random probes were slightly better on average than the two guided probes obtained from four searches. The unsatisfiable control was nearly at ceiling before investigation.

This is a four-instance exploratory comparison, not evidence of a general performance improvement or progress on deciding P versus NP. Aristotle generated distinguishing continuations to guide research; it was not proposed as a polynomial SAT algorithm.

## Protocol, fixed before searching

The initial plan listed nine families. Before any Aristotle query it was narrowed to four, with a limit of **four separator searches per base**. The original nine-family plan was not executed. The final protocol is in `experiment11-protocol.json`.

Every formula uses variables 1–6. Initial probes are 000000 and the six unit vectors, as in Experiment 10. A candidate merge asserts that base A and modified formula B compute the same Boolean function on all 64 continuations.

Candidate generation:

- Add each of the 160 signed clauses with three distinct variables.
- Delete each existing clause.
- Replace an existing clause by flipping one literal's sign.
- Deduplicate syntactically identical resulting formulas, retaining the first provenance. Canonicalization ignores clause and literal order and duplicate clauses; it does not test semantic equivalence.

For each search, cycle preferred candidate kinds `add`, `delete`, `replace`; choose the first unchecked surviving candidate of that kind, falling through cyclically when none is available. A target with zero separators is marked checked and retained. It is not an execution failure.

The separator grammar is the same construction used in Experiment 10: a product of two residual-clause evaluators, accepting the masked string `? ? ? ? ? ? end` exactly for assignments on which the two formulas disagree. The assistant supplies the construction. Aristotle enumerates accepting interpretations and returns at most five rendered witnesses. Among returned witnesses, select the one refuting the most currently surviving candidates; first returned wins ties. Python performs this scoring. No exhaustive truth table is used to choose targets or probes.

Baselines, all computed after the guided runs:

1. **Equal added probes:** 100 deterministic seeds, 11000–11099, drawing distinct uniformly random assignments outside the original seven probes. Use as many additional probes as the guided run actually produced.
2. **Four random probes:** use four additional probes per seed, matching the number of separator searches but not their computational cost.
3. **Transferred probes:** use Experiment 10's selected probes 111101 and 110001, unchanged across bases.

Neither random baseline is compute-matched. A separator search may enumerate many assignments, and guided selection scores several witnesses before choosing one. This comparison measures informativeness of selected probes, not runtime efficiency. The 100 seeds vary probes on fixed formulas; they are not 100 independent formula trials.

## Base formulas

Signed integers below denote literals; each bracket is a disjunctive clause, and the whole list is a conjunction.

- **Implication chain:** `[-i, i+1]` for i=1..5.
- **Parity blocks:** variables (1,2,3) have even parity; (4,5,6) have odd parity. Each constraint is expanded to four 3-CNF clauses, one excluding each wrong-parity assignment.
- **Horn branching:** `[-1,2], [-1,3], [-2,-3,4], [-4,5], [-4,6], [-5,-6]`.
- **Unsatisfiable control:** `[1], [-1], [2,3], [-3,4], [5,-6]`.

The candidate modifications need not preserve the base's family: for example, arbitrary added clauses need not be Horn. Family labels describe the base formula only.

## Executed search record

| Base | Candidate formulas | Initial survivors | Final survivors | Searches | Added probes | Zero-separator searches |
|---|---:|---:|---:|---:|---:|---:|
| Implication chain | 175 | 130 | 110 | 4 | 1 | 3 |
| Parity blocks | 185 | 123 | 76 | 4 | 3 | 1 |
| Horn branching | 179 | 111 | 107 | 4 | 2 | 2 |
| Unsatisfiable control | 171 | 170 | 169 | 4 | 1 | 3 |

Per-round records below give `(candidate kind, total separators, hypotheses eliminated by selected probe)`:

- Chain: `(add,1,20), (add,0,0), (add,0,0), (add,0,0)`.
- Parity: `(add,0,0), (delete,4,3), (replace,8,19), (add,4,25)`.
- Horn: `(add,0,0), (delete,3,2), (replace,3,2), (add,0,0)`.
- Unsatisfiable: `(add,0,0), (delete,12,1), (replace,0,0), (add,0,0)`.

The chain's requested deletion/replacement targets were unavailable after filtering, so the predeclared fallback selected additions. A count above five means only five witnesses were available for scoring; the algorithm did not secretly score all separators.

## Independent verification and false-merge comparison

After completing all searches, Python evaluated all 64 continuations for each candidate formula and each queried pair. All **16 total separator counts matched** exhaustive enumeration. Every returned witness was genuine; the number returned equaled min(5, count). Zero-separator pairs were genuinely equivalent on this domain. No true equivalence was eliminated by guided probes.

Base model counts were 7 (chain), 16 (parity), 9 (Horn), and 0 (unsatisfiable). Genuine equivalent-candidate counts were respectively 80, 1, 84, and 169. Consequently, raw survivors are a poor measure of residual error: retaining many true equivalences is not a failure.

### False merges remaining — lower is better

| Base | Initially | Guided | Guided added probes | Random, equal probes (mean) | Random, four probes (mean) | Experiment 10 transfer (two probes) |
|---|---:|---:|---:|---:|---:|---:|
| Chain | 50 | 30 | 1 | 47.48 | 44.26 | 50 |
| Parity | 122 | 75 | 3 | 104.75 | 100.00 | 103 |
| Horn | 27 | 23 | 2 | 24.78 | 22.79 | 23 |
| Unsatisfiable | 1 | 0 | 1 | 0.77 | 0.35 | 1 |

At equal added-probe count, guided results were strictly better than random in 93, 98, 73, and 77 of 100 seeds respectively, with 7, 2, 18, and 23 ties. The Horn guided result was worse in the remaining nine seeds. Four-probe random runs sometimes beat guidance on both chain and parity despite worse means; no universal dominance is claimed.

False merges left by kind:

- Chain: 30 additions; no deletions or replacements.
- Parity: 67 additions, 6 deletions, 2 replacements.
- Horn: 16 additions, 4 deletions, 3 replacements.
- Unsatisfiable: none.

## What changed in the investigation

After the guided runs, before computing exhaustive labels and baselines, the assistant noted that zero-separator searches might represent genuine equivalences rather than wasted or failed computation. The audit confirmed this. The research objective must distinguish **eliminating false merges** from **certifying true merges**.

The same fixed target-selection policy behaved differently across structures:

- Chain witnesses were informative, but three subsequent searches certified equivalent targets rather than supplying new discriminating probes.
- Parity benefited from challenging different modification kinds, yet retained many false merge claims.
- Horn counterexamples mostly addressed local changes and eliminated few guesses. Two searches confirmed equivalences while false candidates remained.
- The unsatisfiable control illustrates the opposite extreme: most modifications preserve the constantly false function, so large survivor counts were correct.

After seeing the comparison, the next research question became **which surviving candidate should be challenged next**, rather than only which returned witness should be chosen. This is a hypothesis motivated by the results, not an explanation established by a policy ablation. The target policy was not changed after seeing the answers.

The transferred probes' mixed performance also argues against treating Experiment 10's successful bit patterns as generally useful tests. Adaptation to the base appears important in these examples, though four hand-selected bases do not establish a general law.

## Contributions and limitations

- Aristotle supplied counterexample witnesses and exact finite separator counts. Python constructed the grammars, filtered candidate formulas, scored witnesses, and performed the held-back audit and baselines.
- The grammar construction was reused; family-specific languages and target pairs changed, not the separator algorithm. No grammar revision was invented merely to satisfy an experimental narrative.
- These are six-variable examples with known structural contrasts, not broad random samples from each family. Candidate additions outnumber other modifications, and canonicalization/iteration order affect the selected targets.
- Full enumeration is practical here but not evidence of scalability. Near-identical residuals could require expensive equivalence certification at larger sizes.
- The approach held up as a finite discrimination instrument, not as a correctness certificate for every surviving guess. In particular, parity still had 75 false merges and Horn 23 after four searches.
- Selecting a witness from up to five returned samples can depend on parser enumeration order. No global optimal-probe claim is made.
- Some commentary referred to self-check/convergence prompts. Those remarks are not additional experimental conditions; the actual cohort and limits are recorded explicitly above.

## Operational incident and call accounting

The initial `create` failed with `state_id 'r2' already exists`, the separate automatic-ID collision observed after worker restoration. No search ran in that call. The experiment then used uniquely named forks of an existing empty-fragment state, immediately replacing each fork's grammar. Original experiment states were not overwritten.

Total **37 Aristotle calls**: one failed create, four successful forks, sixteen extensions, and sixteen executions. The original failed call is retained. The zero-forest INVALID behavior worked for the new searches; this incident was not a recurrence of the status-classification bug. No production-code fix was attempted during this investigation.

## Artifacts

- `experiment11-protocol.json`: final four-family protocol, exact formulas, probe sets, and pre-query amendment.
- `experiment11-aristotle.jsonl`: all 37 calls with purposes, exact grammar/input arguments, complete responses, and durations.
- `experiment11-guided.json`: candidate CNFs, initial/final surviving IDs, exact challenged pairs, rounds, returned/scored witnesses, and selected probes.
- `experiment11-comparison.json`: per-query exhaustive audit plus false-merge and baseline statistics.

## Follow-up

A meaningful next experiment would hold the base instances and oracle-call limit fixed and compare target-selection policies: current fixed order versus a policy designed to distinguish many candidate summaries. Report both false merges eliminated and true merges certified, alongside total construction/search/scoring cost. Larger variable counts and multiple instances per family are needed before claiming generality. No such follow-up was run here.
