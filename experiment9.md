# Experiment 9 — Directed investigation: SAT reduced to Aristotle parsing

**Directive:** user-directed ("I am directly telling you to work on P=NP using Aristotle").  
**Subject:** can SAT be reduced to context-free parsing in Aristotle such that all three proof obligations for P = NP hold?  
**Result: negative. The construction family cannot yield P = NP; P = NP itself is untouched.**

---

## 1. Problem statement and what a positive result would have required

Aristotle's core operation is context-free parsing with an ambiguity-preserving parse forest. The investigated route:

> Encode a CNF formula φ as (grammar G_φ, input w_φ) such that φ is satisfiable **iff** w_φ has a complete parse in G_φ, with both computable in polynomial time from φ, and recognition decidable without enumerating exponential parses.

This would prove **P = NP** (Cook's formulation, Clay Mathematics Institute statement; read at the start of the run). Three obligations must all hold:

1. **Soundness/completeness:** φ satisfiable ⇔ ∃ complete parse.
2. **Polynomial construction:** G_φ and w_φ polynomial-size, polynomial-time.
3. **Polynomial recognition:** accepting w_φ in polynomial time (not by enumerating all parses, whose count can be exponential in |φ|).

Both directions of the reduction must be efficient for a valid P = NP proof: a reduction from SAT to parsing yields P = NP only if the reduction itself is poly-time and the target problem (existence of a complete parse) is decidable in poly time.

Aristotle's `execute` reports parse existence/counts. `parse` and `execute` share the same underlying enumeration: `worker/marpa-worker.pl:111-140` (`enumerate_values`) — recognition is by **tree enumeration**; the worker has no packed-forest existence/decision shortcut.

---

## 2. Why grammar-construction was the right thing to test first

The natural encoding is: nonterminal per (position, partial-assignment-on-frontier), productions per (clause, local assignment). This is a **frontier-based grammar**, mirroring dynamic programming over clause order. It was the obvious first candidate and the one whose failure mode is diagnostic: if the grammar must carry full partial assignments across clause boundaries, its size is governed by the formula's **pathwidth/treewidth**, which is unbounded for 3-CNF. The experiment made this concrete and quantitative.

## 3. What was built and run (29 Aristotle calls, all logged in `experiment9-aristotle.jsonl`)

### 3.1 Consistency failure of the naive encoding (calls 1–4)

- **v1 (independent clauses):** clause-level nonterminals, no shared state. Input `c0 c1` for clauses (x) ∧ (¬x) → **VALID, 1 parse**. Accepts contradiction.
- **v2 (frontier encoding):** retains shared-variable assignment at clause boundary. Same input → **INVALID**. Decision trace names the contradiction.

**Established:** per-clause encoding is wrong; shared-variable consistency must be represented structurally.

### 3.2 Exact verification at n=2 (calls 5–20)

Formula F = (x∨y) ∧ (¬x∨y) ∧ (x∨¬y) ∧ (¬x∨¬y), prefixes of 1..4 clauses, ground truth 3/2/1/0 models by brute force.

Grammar: one branch per total assignment (2ⁿ branches), tokens `v`/`T`/`F` hide the assignment; clause tokens `c_i` present iff satisfied by that branch.

| Clause prefix | Expected models | Aristotle parse count | Status |
|---|---|---|---|
| 1 clause | 3 | 3 | AMBIGUOUS |
| 2 clauses | 2 | 2 | AMBIGUOUS |
| 3 clauses | 1 | 1 | VALID |
| 4 clauses | 0 | 0 | INVALID |

Every count matched brute force; returned structures disambiguated masked assignment tokens. **Encoding is sound and complete at n=2.**

### 3.3 Correctness at scale (calls 21–29)

Three random 3-CNF instances (n=6/7/8, m=9/11/16):

| n | m | models (brute) | Aristotle forest count | Match |
|---|---|---|---|---|
| 6 | 9 | 23 | 23 | ✓ |
| 7 | 11 | 25 | 25 | ✓ |
| 8 | 16 | 22 | 22 | ✓ |

**Established:** the frontier encoding is correct — Aristotle's forest counts equal model counts, on every tested instance.

### 3.4 The size barrier (Python, corroborating the calls)

Grammar metrics (generator `frontier_grammar`, seeds recorded):

| n | m | width | states | grammar size |
|---|---|---|---|---|
| 8 | 16 | 8 | 2,306 | 118 KB |
| 12 | 20 | 12 | 29,042 | 1.9 MB |
| 14 | 20 | 13 | 41,634 | 2.9 MB |
| 16 | 25 | 15 | 299,490 | 22.7 MB |
| 18 | 30 | 15 | 245,602 | 19.1 MB |
| 20 | 35 | 19 | 5,091,682 | 425.8 MB |
| 24 | 40 | 19 | 5,002,178 | 469.5 MB |

Derivation of the size formula: the grammar contains one state nonterminal per (clause boundary, partial assignment on variables crossing that boundary). For a cut after clause i, that set is B_i = {vars in clauses 1..i} ∩ {vars in clauses i+1..m}, size |B_i|. Hence

> **|G_φ| states = Σᵢ 2^|B_i|**

Verified numerically against the generator on **all 13 recorded instances** (exact match, including the tiny instrumented n=3 instance of `experiment9-boundary.json`, where each cut has exactly 2^width state nonterminals and total 26 = 1+8+8+8+1). The formula is not an approximation: it is the definition of the construction, and the generator is a mechanical realization of it.

**Obligation 2 fails:** for any 3-CNF family whose pathwidth/treewidth grows (e.g., random 3-CNF at ratio ≥ ~4.3, or explicit expanders), max|B_i| grows linearly in n, so |G| grows **exponentially** in the input size. The construction is not polynomial.

### 3.5 Could a better clause ordering rescue polynomiality?

Ordering matters (treewidth of the primal graph depends on elimination order):

| n | m | width (clause order) | width (min-fill) |
|---|---|---|---|
| 16 | 25 | 15 | 8 |
| 20 | 35 | 19 | 10 |
| 24 | 40 | 19 | 9 |

Min-fill reduces the **exponent** but treewidth of 3-CNF is unbounded; min-fill is a heuristic, not a guarantee. No ordering trick yields polynomial size on general 3-CNF.

### 3.6 Counting vs deciding: the asymmetry that kills the route

Even if the grammar were polynomial-size, `execute` returns the **count of all parses**, and each parse can be exponentially numerous. Recognition would need an **existence** decision without enumeration. The worker does not provide it:

```perl
# worker/marpa-worker.pl:111-140 (read during the run)
while (defined(my $v = $recce->value())) { $value_count++; ... }
```

This is a real scalability ceiling of the current Aristotle implementation, not just of this experiment: `execute`/`parse` cannot decide existence of a parse in sub-enumeration time.

---

## 4. What this establishes, and what it does not

**Established (negative, about the route):**
- Per-clause grammars are unsound (accept contradictions); consistency must be carried structurally.
- The frontier encoding is **correct** (counts and structures match brute force at n=2, and forest counts match at n=6,7,8).
- Its size is exactly Σᵢ 2^|B_i| — verified numerically on all instances, including a per-boundary instrumented n=3 instance — hence **exponential** in general.
- Treewidth/ordering heuristics reduce the exponent, not the growth class.
- The current `execute` interface counts parses by enumeration; no packed-forest existence decision exists in the worker.

**Therefore:** the proposed construction family cannot satisfy obligation 2 for general 3-SAT. **This route does not establish P = NP.** It reduces SAT to parsing only for **bounded-pathwidth** formulas (already in P via standard DP), so it is a repackaging of a known P-fragment, not a new reduction covering all of NP.

**Not established:**
- P ≠ NP (this experiment rules out one construction family, nothing more).
- Any general theorem about parsing-based reductions, or that **no** grammar-based encoding can exist — only that this one, and anything isomorphic to it (frontier DP in disguise), is exponential.
- Any improvement to Aristotle's scalability (that is future engineering work, not this result).

## 5. What Aristotle actually contributed here

- **Mechanical soundness testing** of the encoding at n=2 and n=6/7/8: forest counts matched brute-force model counts exactly, catching nothing wrong with the *logic* but exposing that the barrier is **representation size**, not correctness.
- **Structure disambiguation** of masked assignment tokens (the returned S-expressions distinguished 01/10/11 at n=2), confirming the encoding preserves model identity, not just counts.
- **INVALID with a decision trace** on the contradictory instance (calls 4): the parser's own diagnostics located exactly where the constraint failed — useful for debugging the encoding, and it correctly rejected x∧¬x once consistency was structural.

## 6. What Aristotle could not do (the honest boundary)

- **No poly-size construction:** the tool takes a grammar as data; it cannot compress the frontier representation. Nothing in the API (create/extend/execute/commit/fork) provides a mechanism that would make Σᵢ 2^|B_i| polynomial.
- **No sub-enumeration decision:** `execute` counts all parses; the worker has no existence-only mode. Even a perfect poly-size grammar would not give obligation 3 with today's worker.
- **No proof machinery:** obligation 1 (soundness/completeness) was argued by hand (induction over the grammar definition) and verified empirically at small n. Aristotle does not produce or check the induction.

## 7. Errors and corrections during the run (transparency)

- One harness indexing bug aborted a cohort loop after two calls (fixed immediately; wasted calls remain in the log).
- A `parse` on zero fragments returned the empty-string forest (0 parses) and cannot count models — a measurement artifact, corrected by using the `execute` forest.
- A kernel timeout killed the Python kernel mid-run; recovered by re-deriving against saved measurements rather than regenerating 400 MB grammars.
- A `NameError` on `product` (missing import in a rebuilt kernel); fixed immediately.
- No Aristotle tool defect was hit this run; the zero-forest VALID bug fixed after Experiment 8 did not recur (INVALID was correctly returned for the 0-model case here).

## 8. Verdict

The directed question — "work on P=NP using Aristotle, see how far we can get" — yields a **clean negative result about the most natural grammar-based route**: the encoding is correct but necessarily exponential, and the tool's recognition layer cannot decide parse existence without enumeration. Neither P = NP nor P ≠ NP is settled; P = NP remains open (per the Clay Institute statement of the problem).

What this run does deliver is a precise, verified characterization of **why** grammar-as-search-space fails for NP-complete problems in this framework: the search space is a set of *assignments*, not a set of *parse trees*, so representing it as a CFG inflates the grammar exponentially with the formula's pathwidth. This is consistent with, and now concretely illustrated by, the Experiment 8 finding (parse ambiguity counts what trees, not what assignments).

**Follow-ups that would be real work, not more null results:**
- Implement packed-forest existence/counting in the worker (`$recce->value()` → forest-based counting), removing the enumeration ceiling. This would make bounded-treewidth SAT genuinely practical through Aristotle.
- Explore encodings whose *parse trees*, not assignments, are the objects of interest — e.g., formulas whose satisfying assignments correspond to parse derivations of a fixed polynomial-size grammar. That is the only shape this route could take toward P = NP, and it would require a genuinely new idea, not more of this experiment.

## Direction correction (2026-09-17, post-report)

The researcher corrected the framing after this report: Aristotle's intended role
is not to *solve* the object problem (here, SAT) but to serve as an instrument
for exploring the *research* solution space — representing competing approaches,
checking argument shapes against known barriers, filling gaps provisionally so
work can continue, and choosing which experiments discriminate which hypotheses.
Experiment 9 tested only the former. The reframed investigation continues in
`experiment10.md`. The negative result of §3–§4 (grammar-as-assignment-space is
exponential) remains valid and is reused there as a known boundary.
