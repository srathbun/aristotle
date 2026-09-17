# Experiment 7 — Open-Ended Tool Interplay on Logic-Grid Puzzles

**Status:** Run (headless treatment, gpt-oss:20b, 6 pilot trials). See "Results" below.
**Relationship to existing hypotheses:** Tests a distinct claim from H1–H6. Proposed as
**H7**, stated below. Builds on the mechanisms behind H5 (ambiguity as deferred
commitment) and H6 (runtime-driven grammar extension), but asks a different question
than either: not whether one designed mechanism helps, but whether the LLM discovers
and composes uses of the tool's capabilities on its own, the way a programmer uses a
REPL and a test suite — write something, run it, read what comes back, revise the
*tool* as well as the input when the feedback warrants it.

---

## 1. What this experiment is actually testing

Every earlier draft of this experiment (see prior log entries) made the mistake of
pre-selecting a mechanism — grammar-as-validator, completeness-forcing, emit-and-inspect
— and then measuring whether that one designed technique helped. That approach tests a
workflow Claude or the user designed, not a capability of the LLM. It also risks
quietly reintroducing conventional constraint-solving logic (the same failure mode
already identified and rejected for Sudoku, and again for job-shop scheduling on
2026-09-16) by having a human decide, in advance, exactly how elimination should work.

**H7 — Tool interplay.** Given open-ended access to a Marpa-backed reasoning tool
(construct a grammar, feed it input streams, read back parse status and diagnostics,
extend or replace the grammar, retract prior input) and *no* prescribed technique for
using it, an LLM will use the tool the way a programmer uses a REPL paired with a test
suite: iterating on both its input **and** the tool's own definition in response to what
the tool reports, rather than treating the tool as a static function it calls with
varying input.

This is a claim about *process*, not about task success. A model could solve every
puzzle correctly while only ever varying input against a grammar it built once and never
revised — that would be normal tool use, and would falsify H7 even with perfect task
scores. Conversely a model that revises its grammar in direct response to what the tool
told it, even if it doesn't reach a final answer, is exhibiting the behavior under test.

## 2. The tool, as presented to the LLM

The LLM is told a Marpa-backed tool exists with the following operations, described the
way one would describe a REPL and test runner to a competent engineer — no worked
example, no suggested protocol, no hint toward any particular technique:

- **construct** — define or replace the current grammar.
- **extend** — add to the current grammar without discarding the prior version
  (existing, already-implemented primitive).
- **parse** — feed an input stream (accumulated facts/hypotheses) through the current
  grammar; returns valid / invalid / ambiguous, with Marpa's diagnostic detail
  (`Expected:` traces on invalid, candidate count on ambiguous).
- **emit** — grammar rules may define semantic actions that produce output text
  alongside ordinary parsing; this is available if the LLM's grammar uses it, not
  assumed or required.
- **retract/rollback** — remove a previously asserted fact or hypothesis from the
  stream (existing `commit`-adjacent machinery).

Deliberately not specified: any particular strategy for detecting duplicates, forcing
completeness, or resolving ambiguity. Whether the LLM discovers a technique such as
requiring a complete set of slots to force out a contradiction, or using `emit` to
surface values for its own inspection, or asserting genuinely ambiguous tokens and
reading back the surviving candidate set, is itself part of what is being observed —
not a fixed condition of the experiment.

## 3. Puzzle conditions

Two conditions, both required, because they test complementary and unequally important
failure modes.

### 3a. Solvable instance

A standard logic-grid puzzle (N entities × M categories, N/M = 4 or 5) constructed so
that the clues given uniquely determine a solution via elimination alone — no guessing
required. Success here looks like: correct final solution, reached through a transcript
that shows tool-grammar interplay (see logging below), not brute serial guessing against
a static tool.

### 3b. Underdetermined instance

The same puzzle shape, deliberately missing one required clue (or with one clue
withheld), constructed so that the true solution space has more than one valid
completion and **no further legitimate assertion can narrow it further** — this is
known ground truth at construction time, not something inferred after the fact from the
LLM's failure to find an answer.

This condition exists to test a capability distinct from H5's "defer a choice until more
evidence arrives": here, no more evidence is coming. The correct behavior is not to
narrow further — it's to recognize that narrowing has stalled *because the problem
itself is incomplete*, not because the tool or the grammar is inadequate, and to stop
and say so rather than present a guess as a confident answer.

Per the user's explicit instruction: the LLM's correct terminal action in this condition
is to state the ambiguity honestly and ask a clarifying question, as its **final
output** for the trial — not through a separate live tool affordance. The trial ends
there; if a real clarifying answer is available (e.g., the researcher supplies the
missing clue in a follow-up message), the stream can continue, but the tool-interplay
portion of the trial is considered complete at the point the question is asked.

The two conditions are scored against different success shapes, and a model doing well
on one and poorly on the other is a specific, useful finding, not a mixed result to
average away:

| Condition | Success looks like | Failure to watch for |
|---|---|---|
| 3a Solvable | Correct unique answer, via observed grammar/input revision cycles | Guessing to a lucky-correct answer without real interplay (looks identical to success unless the transcript is inspected) |
| 3b Underdetermined | Stalling recognized, correctly attributed to the *puzzle*, honest report + question as final output | (i) Confidently presenting one candidate as the answer; (ii) recognizing the stall but misattributing it to a flawed grammar and thrashing on grammar revisions that cannot help |

Failure mode 3b(ii) is worth calling out specifically: a model that keeps rewriting its
grammar because it believes the *tool* is broken, when the actual problem is that the
puzzle is missing information, has not learned to trust the tool's report — it's
building a model of its tool rather than a model of the problem, which is close to the
opposite of what H7 is asking about. This is a genuinely useful negative signal, not
noise, and should be logged as its own category, not folded into a generic "failed to
solve" bucket.

## 4. Baselines and trials

- **A = prose only.** No tool access, both conditions. Establishes whether the model
  already handles logic-grid elimination and honest ambiguity-reporting without any
  tooling — if it does well on 3b unaided, that raises the bar for what the tool
  condition needs to show.
- **Treatment.** Full open-ended tool access as described in §2, both conditions,
  seed-repeated (≥10 trials per condition per the plan's existing discipline).
  Deliberately **no separate designed-technique baseline** ("B") this round: pre-picking
  a technique to compare against would presuppose the answer to what's being asked.
  Comparing across repeated treatment trials — what techniques appear, how often, with
  what effect — is itself the primary result, not a variance nuisance to control away.

## 5. Logging (in addition to the plan's existing §36.4 requirements)

Every tool call, classified as one of:

- new grammar construction
- grammar extension/revision (and: did it change what the grammar *accepts*
  structurally, or only what it *emits* informationally — these are not equally
  interesting; structural revision is the harder, more diagnostic move)
- input assertion (a known fact vs. an explicit hypothesis/guess vs. a genuinely
  ambiguous multi-candidate token, if used)
- retraction/rollback
- read-only inspection

For every grammar revision specifically: what immediately preceded it (which
diagnostic, which emitted output, which invalid/ambiguous result) — so the causal claim
("the tool's feedback changed what the LLM did with the tool," not just what it asserted
next) is visible in the transcript rather than inferred.

For condition 3b specifically: the point, if any, at which the model's attribution
shifts from "my grammar/input is wrong" to "the puzzle is underdetermined" — flagged as
a specific transcript moment, plus the final action taken (honest report + question,
silent guess, or grammar-thrashing with no resolution).

## 6. Success criteria and falsification, stated before running

**Supports H7 if:** across repeated treatment trials on 3a, transcripts show grammar
*structure* being revised in direct response to tool feedback (not just input varied
against a static grammar), and on 3b, a majority of trials show correct attribution of
stalling to the puzzle rather than the tool, ending in an honest ambiguity report rather
than a confident wrong guess.

**Falsifies H7 if:** on 3a, the model only ever varies input against a grammar built
once at the start and never revises it, regardless of what invalid/ambiguous feedback
says — i.e., it uses the tool as a one-shot function, not a REPL. This is a valid,
reportable negative result even if 3a task success is otherwise good, because task
success alone does not distinguish "used the tool as intended" from "got lucky guessing
against a static checker."

**Independently reportable regardless of H7's outcome:** 3b performance under the prose
baseline (A) versus treatment. If prose-only already reliably recognizes and reports
irreducible ambiguity, that's a ceiling result in the shape of E1's ordering-task
finding — worth recording plainly rather than treated as a disappointment.

## 7. What this experiment does not claim

This does not test whether Marpa's parser structurally enforces logic-grid constraints
(an earlier draft's "grammaticality-as-constraint" idea) — the grammar the LLM builds
may or may not do that, and whether it does is itself an observed outcome, not a
designed condition. It does not test a specific mechanism (completeness-forcing,
emit-and-inspect, ambiguous-token preservation) in isolation — any or all of these may
appear, or none may, and which ones appear and how effectively is the substance of the
result. It is not a claim that generalized parsing solves logic puzzles; it is a claim
about whether an LLM treats a Marpa-backed tool as a revisable instrument in an
iterative reasoning loop, analogous to code-and-test-suite iteration, rather than as a
fixed oracle.

---

## 8. Results (headless treatment, gpt-oss:20b)

**Setup.** `scripts/experiment7.ts` runs the model headlessly (`omp -p --mode json`)
with open-ended `reason`-tool access and a puzzle-only prompt — no answer, no technique,
no worked example in the prompt text (the tool's *registered* schema description is
still visible to the model). Six pilot trials: 3a solvable and 3b underdetermined, three
each. Every `reason` call is extracted from `tool_execution_end → result.details.xdev`
and the transcript is written to `/tmp/e7-*.jsonl`.

**Result — zero tool calls in all six trials.** No grammar was ever constructed, parsed,
or revised.

- **3a (solvable):** all three trials produced the correct solution from mental
  elimination. In **two of three**, the final-answer text *confabulated* tool use —
  e.g. *"Explanation (using the `reason` tool): we defined a tiny grammar… each clue was
  parsed"* — while the transcript shows zero calls. This is §3a's "lucky-correct without
  real interplay" failure mode, realized *inside the answer text itself*: the model
  narrated the behavior it judged was expected, rather than performing it.
- **3b (underdetermined):** all three trials correctly recognized the irreducible
  ambiguity (Carl/Dana swap fish↔bird, "no clue distinguishes them"), entirely in prose.

**Assessment.** H7 is **falsified** on this construction: the model never builds or
revises a grammar (it does not even reach "one-shot function" — it never calls the
tool). The prose-only ceiling predicted by §7 is confirmed for 3b.

**New finding (worth its own record).** Task success plus a plausible "I used the tool"
narrative is **not** evidence of tool use — only an audited transcript distinguishes
real interplay from a confabulated report. This strengthens the experiment's core
design point: the transcript, not the answer, is the measurement instrument.

## 9. Rebuild result (5×4 grid, thinking ON)

Second treatment to remove two confounds from §8's run: a puzzle sized past the
mental-tracking ceiling, and reasoning mode enabled (no `--thinking off`). Puzzle = 5
people × 4 categories (pet/color/drink/hobby), 15 clues (10 relational), ground truth
brute-force-verified: 3a unique; 3b (drop "Bob's drink is coffee") exactly 2 solutions
(Bob↔Erin swap {coffee,running}/{soda,music}). Prompt = plain capability description
(create/extend/execute) + clues, with **no** "use it however you find useful" nudge.
Six trials: 3a ×3, 3b ×3.

**Result — zero `reason` calls in all six trials; no confabulation.**

- 3a: 3/3 correct, solved mentally.
- 3b: 1/3 flagged the two solutions; 2/3 gave one candidate as if unique.

**H7 remains falsified**, now for a stronger reason: even a 5×4 grid (5!⁴ ≈ 2×10⁸
assignments) did not push the model past in-context tracking, so it never reached for
the tool. Two refinements to §8: (a) the §8 confabulation was a prompt-nudge artifact —
under a neutral prompt the model does not fabricate tool use; (b) underdetermination
detection *degrades* with puzzle size (3/3 on 4×2 → 1/3 on 5×4), leaving the one place a
tool would plausibly help, still unused.