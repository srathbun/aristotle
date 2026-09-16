# OMP + Marpa Dynamic Reasoning Language
## Proof-of-Concept Development Plan

**Status:** Living design/development document  
**Repository:** Empty Git repository intended to contain the implementation  
**Primary target:** Windows + oh-my-pi (omp)  
**Research thesis:** An LLM can use an ambiguity-preserving generalized grammar as an externalized reasoning state, treating grammar construction, ambiguity resolution, and grammar extension as operations in an iterative reasoning process.

---

## 1. Purpose

This repository will develop the smallest practical proof of concept for a research project exploring the following idea:

> **An LLM can use a dynamically extensible formal language as an externalized reasoning substrate, with generalized parsing used to expose ambiguity, missing structure, and competing hypotheses, while the LLM decides how to respond to that feedback.**

The initial implementation is not intended to be a general-purpose reasoning system, an LLM replacement, or a complete implementation of Marpa. Its purpose is to establish whether the proposed interaction model is useful and observable enough to justify deeper research.

The implementation should therefore favor:

- minimal code;
- explicit state;
- deterministic, inspectable behavior outside the LLM;
- easy experimentation;
- easy replacement of components;
- reproducible tests;
- low token overhead;
- and clear separation between parser mechanics and reasoning policy.

The project should remain small until an experiment demonstrates that the architecture produces behavior worth expanding.

---

# 2. Research Thesis and Questions

## 2.1 Thesis

The project investigates a question deeper than "does parsing improve LLM reasoning":

> **Can an LLM construct, execute, observe, and iteratively refine specialized computational machinery as part of its reasoning process?**

The parser is not intended to "think for" the LLM. Instead, it provides a formal environment in which the LLM can construct representations and machines, and obtain feedback about them:

1. construct representations and executable languages;
2. generate candidates and add observations/hypotheses;
3. ask whether a structure is valid;
4. inspect competing interpretations (ambiguity);
5. obtain feedback about unresolved ambiguity;
6. gather additional information;
7. execute semantic computations and read their results;
8. revise its representation;
9. extend the language when the existing grammar is inadequate;
10. reparse/re-execute under the new language.

## 2.2 Initial research questions

### RQ1 — Externalized structure

Does giving an LLM an explicit generalized-parser-backed reasoning state improve its ability to maintain and manipulate structured reasoning?

### RQ2 — Dynamic grammar construction

Can an LLM productively extend the grammar of its reasoning language at runtime when the existing language is inadequate?

### RQ3 — Ambiguity as a reasoning signal

Does explicit parser-reported ambiguity cause the model to behave differently from ordinary unconstrained reasoning?

In particular, does the model learn to distinguish:

- "I can choose one of these interpretations;"
- "I need more information;"
- "these interpretations are equivalent for my current purpose;"
- "my grammar is wrong or incomplete?"

### RQ4 — Competing hypotheses

Can an ambiguity-preserving parse forest serve as a useful external representation of competing hypotheses throughout a reasoning process?

### RQ5 — Representation efficiency

Can a task-specific reasoning DSL represent useful reasoning state with substantially fewer tokens than repeatedly expressing equivalent state in natural language?

Token efficiency is a secondary experiment. It should not complicate the first proof of concept.

## 2.3 Tool use vs constructed machinery, and grammar roles

Two ways an LLM involves computation (this distinction runs through the whole project):

- **Normal tool use.** The LLM invokes a *pre-existing* program — a calculator adds, a
  solver searches, a validator checks. The program is fixed; the LLM supplies input and
  reads output.
- **Aristotle hypothesis.** The LLM *constructs or modifies* the program/language that
  defines and explores the problem's computational representation, then uses the
  resulting machine as an external reasoning/search substrate.

A grammar is not one thing. Distinguish five roles, of increasing novelty:

1. **Output schema** — the shape the model's output must have.
2. **Validator** — rejects structures that violate stated constraints.
3. **Executable procedure** — semantic actions compute results over accepted input.
4. **Search-space representation** — delimits the set of candidate structures (valid
   tours, valid colorings); the machine rejects invalids and preserves alternatives.
5. **Evolving computational artifact** — the grammar is repeatedly modified by the LLM
   as its understanding of the problem changes.

Roles 4 and 5 are where the novel research direction lives; roles 1–3 are necessary but
sit close to existing structured-output and schema-validation work.

---

# 3. Scope of the Proof of Concept

The first version MUST implement only the following conceptual loop:

```text
LLM
 |
 | reasoning tool call
 v
OMP extension
 |
 v
Reasoning state
 |
 +--> current grammar
 |
 +--> accumulated input fragments
 |
 +--> grammar version
 |
 +--> parser
 |
 v
Parse result
 |
 +--> valid/unambiguous
 |
 +--> ambiguous
 |
 +--> invalid / incomplete
 |
 v
LLM receives structured feedback
 |
 +--> add more reasoning
 +--> inspect ambiguity
 +--> add evidence
 +--> extend grammar
 +--> commit a choice
 +--> finish
```

The first version does NOT need:

- a large general-purpose reasoning DSL;
- semantic theorem proving;
- probabilistic weighting of parse trees;
- automatic grammar synthesis without LLM approval;
- a UI beyond normal omp tool output;
- a native Node binding;
- Python bindings;
- direct integration with the internals of the LLM;
- or a replacement for normal omp tool calls.

---

# 4. Architectural Principle

The central design decision is:

> **The grammar is state, not merely configuration.**

Do NOT build the core API around:

```text
parse(grammar, input) -> result
```

Instead, build around a persistent reasoning language/state:

```text
ReasoningState
├── state_id
├── grammar
├── grammar_version
├── fragments
├── parser_state / parse results
├── ambiguities
└── metadata
```

The LLM interacts with that state through an omp tool.

---

# 5. System Architecture

## 5.1 High-level architecture

```text
                        ┌────────────────────┐
                        │        LLM         │
                        │                    │
                        │ generate / inspect │
                        │ revise / decide    │
                        └─────────┬──────────┘
                                  │
                            reason(...)
                                  │
                                  v
                   ┌──────────────────────────┐
                   │      OMP Extension       │
                   │                          │
                   │ tool registration        │
                   │ state/session management │
                   │ RPC to Marpa worker      │
                   │ result formatting        │
                   └────────────┬─────────────┘
                                │
                         structured RPC
                                │
                                v
                   ┌──────────────────────────┐
                   │    Marpa Reasoning       │
                   │        Worker            │
                   │                          │
                   │ grammar versions         │
                   │ fragments                │
                   │ parser                  │
                   │ parse forest             │
                   │ ambiguity inspection     │
                   └──────────────────────────┘
```

## 5.2 Why a worker process initially?

The project should initially avoid writing new Marpa bindings.

The preferred proof-of-concept architecture is:

```text
TypeScript omp extension
        |
        | JSON over stdin/stdout
        v
persistent Perl process
        |
        v
Marpa::R2
```

This has several advantages:

- Marpa::R2 is already a mature interface to Marpa;
- the high-level Perl interface provides capabilities we want to experiment with;
- no Python binding is required to validate the research idea;
- no native Node binding is required;
- parser state can live in one persistent process;
- the worker can be replaced later without changing the reasoning protocol;
- the boundary is explicit and testable.

The first implementation should treat the worker as an implementation detail behind a small protocol.

A native binding or Python package may be considered only after the proof of concept demonstrates value.

---

# 6. Technology Choices

## 6.1 OMP side

Use the current omp extension API.

Current omp documentation describes an extension as a TypeScript/JavaScript module with a default factory receiving `ExtensionAPI`. Extensions can register LLM-callable tools with `pi.registerTool(...)`, and extension state can be reconstructed from session entries. See:

- https://github.com/can1357/oh-my-pi/blob/main/docs/extensions.md
- https://github.com/can1357/oh-my-pi/blob/main/docs/skills/authoring-extensions.md

For the initial prototype, prefer a normal extension over lower-level custom-tool machinery because the extension API gives us session lifecycle hooks and persistent state facilities.

## 6.2 Parser side

Use `Marpa::R2` through Perl for the initial worker.

Marpa::R2's current documentation states that it can parse BNF grammars including ambiguous grammars and provides ambiguity inspection through its Scanless interface.

See:

- https://metacpan.org/dist/Marpa-R2
- https://metacpan.org/dist/Marpa-R2/view/pod/Tutorial2.pod

## 6.3 Windows Perl

The target development environment is Windows.

Use Strawberry Perl as the preferred Perl distribution because it provides a Windows Perl development environment capable of installing CPAN modules, including XS modules.

Do not hard-code an installation directory. The implementation should discover `perl` from `PATH` or allow an explicit configured path.

The preferred one-time setup is conceptually:

```powershell
perl --version
cpanm --version
cpanm Marpa::R2
perl -MMarpa::R2 -e "print qq(Marpa::R2 OK\n)"
```

If `cpanm` is unavailable, document the CPAN-shell alternative.

Do not make Windows-specific assumptions in the core protocol.

---

# 7. Repository Layout

The target repository should evolve toward:

```text
.
├── README.md
├── PLAN.md
├── package.json
├── tsconfig.json
├── src/
│   ├── extension.ts
│   ├── reasoning-tool.ts
│   ├── state.ts
│   ├── protocol.ts
│   └── worker.ts
├── worker/
│   └── marpa-worker.pl
├── grammars/
│   └── examples/
├── tests/
│   ├── protocol/
│   ├── worker/
│   ├── extension/
│   └── integration/
├── experiments/
│   ├── README.md
│   ├── ambiguity/
│   ├── dynamic-grammar/
│   └── token-efficiency/
└── docs/
    ├── protocol.md
    └── experiments.md
```

The first commit does not need every directory. Create only what the current milestone requires.

---

# 8. Reasoning State Model

The initial state should be deliberately simple.

Conceptual model:

```text
ReasoningState {
    id
    grammarVersion
    grammarDefinition
    fragments[]
    lastParse
}
```

A grammar version should be immutable.

Grammar evolution creates a new version:

```text
v1 -> v2 -> v3
```

Do not destructively overwrite an earlier grammar definition.

This allows experiments to compare:

```text
same fragments + grammar v1
same fragments + grammar v2
```

and makes debugging possible.

---

# 9. Fragments

Reasoning should be represented as an appendable stream of fragments rather than requiring the LLM to regenerate one giant string.

Example:

```text
fact(A)
depends(A,B)
depends(B,C)
missing(C)
```

The state maintains these fragments in order.

The worker can materialize them into the parser's expected input representation.

A fragment should have at least:

```text
{
    id,
    text,
    sequence
}
```

Do not initially introduce rich semantic metadata.

---

# 10. Grammar Representation

The first grammar representation should be human-readable BNF or a similarly direct textual representation that Marpa can consume.

Example:

```text
:start ::= statement+

statement ::= fact
statement ::= dependency
statement ::= missing

fact ::= 'fact(' symbol ')'
dependency ::= 'depends(' symbol ',' symbol ')'
missing ::= 'missing(' symbol ')'

symbol ~ [A-Za-z_]+
```

The actual concrete grammar should be validated against Marpa before the extension is integrated.

The exact DSL is intentionally experimental.

Do not prematurely optimize the syntax.

---

# 11. The Reasoning Tool

The first tool should expose a single LLM-callable tool named something like:

```text
reason
```

The tool should support a small explicit operation set.

Initial operations:

```text
create
add
parse
inspect
extend
reset
```

Possible request shape:

```json
{
  "operation": "create",
  "state_id": "optional-name",
  "grammar": "..."
}
```

```json
{
  "operation": "add",
  "state_id": "...",
  "fragment": "..."
}
```

```json
{
  "operation": "parse",
  "state_id": "..."
}
```

```json
{
  "operation": "inspect",
  "state_id": "..."
}
```

```json
{
  "operation": "extend",
  "state_id": "...",
  "grammar": "..."
}
```

The exact schema may change during implementation. Keep it small.

---

# 12. Tool Semantics

## create

Creates a reasoning state and grammar version 1.

Returns:

```text
state_id
grammar_version
status
```

## add

Appends a reasoning fragment.

Adding a fragment does NOT necessarily imply parsing.

The model must explicitly ask to parse so it can choose when to inspect its state.

## parse

Parses the accumulated stream under the current grammar.

It must return a structured status such as:

```text
VALID
AMBIGUOUS
INVALID
INCOMPLETE
```

The exact distinction between INVALID and INCOMPLETE should be determined after examining Marpa behavior in the first implementation.

## inspect

Returns a compact representation of:

- current grammar version;
- fragment count;
- parse status;
- ambiguity count or ambiguity summary;
- useful candidate interpretations;
- parser diagnostics when available.

The output must be concise enough that the tool remains useful to an LLM.

## extend

Creates a new immutable grammar version.

The new grammar should be:

1. validated;
2. compiled;
3. installed as the current grammar;
4. used to reparse the accumulated fragments if requested.

The extension operation must never silently discard the prior grammar.

## reset

Deletes or invalidates the current state.

Used primarily for experiments and debugging.

---

# 13. Ambiguity Handling

Ambiguity is a feature, not an error.

The system should distinguish:

```text
UNAMBIGUOUS
```

from:

```text
AMBIGUOUS
```

and expose competing parses in a compact, machine-readable form.

The first version does not need to expose an enormous full parse forest.

Prefer:

```text
AMBIGUOUS
2 interpretations

1. ...
2. ...
```

with an optional expanded inspection operation.

The LLM should receive enough information to decide what to do next.

Possible model responses include:

- choose one;
- add information;
- ask the user;
- invoke another tool;
- revise the reasoning;
- modify the grammar;
- decide the ambiguity is irrelevant.

The plugin must not automatically choose an interpretation merely because one appears first.

---

# 14. Ruby Slippers / Grammar Repair

Ruby Slippers behavior should be introduced only after ordinary ambiguity handling works.

The desired interaction is:

```text
parse
 |
 v
not recognized under current grammar
 |
 v
identify possible insertion / structural repair
 |
 v
return candidate repair information
 |
 v
LLM decides whether repair is legitimate
 |
 +---- reject
 |
 +---- transform grammar
 |
 v
grammar v(n+1)
 |
 v
reparse
```

The LLM should remain the authority deciding whether a proposed grammar change reflects the intended reasoning language.

The parser may propose structural possibilities, but it should not silently redefine the language.

The implementation should preserve:

```text
old grammar
new grammar
reason for change
```

for later analysis.

**Decision (2026-09-07):** not implemented for the POC — deferred (see §34 Research
Record). M11's LLM-driven `extend` loop already covers grammar repair using
`show_progress` expected-production diagnostics; Marpa::R2 exposes the
pause/resume surface (`$recce->resume`, `$recce->pause_lexeme`) if
parser-proposed insertions are later justified.

---

# 15. Session and Persistence Model

The omp extension should treat reasoning state as session-aware.

Use omp's extension state/session mechanisms rather than relying only on process memory.

Important session events include:

- session start;
- session branch;
- session tree/navigation;
- session shutdown.

The extension should be able to reconstruct enough state to continue a reasoning session after restart or branch.

The initial implementation may persist a compact state record containing:

```text
state id
current grammar version
grammar source
fragment list or fragment log
```

Avoid putting parser internals directly into persistent state.

The worker should be able to reconstruct parser state from the durable reasoning representation.

This makes the system easier to debug and version.

**Continuation (2026-09-07):** session continuation is done with `--resume
<session-id>` (omp), which resumes the exact session so `getBranch()` returns that
session's entries. omp's `-c` continuation flag is not used (smoke S4) because it
unpredictably continues a different session, which would make `getBranch()` return
the wrong entries and rebuild the state incorrectly.

---

# 16. Branching

Reasoning state should conceptually branch with the omp conversation.

Example:

```text
State A / Grammar v3
       |
       +------ hypothesis X
       |
       +------ hypothesis Y
```

Do not solve complete branch-aware semantics in milestone 1.

However, design the state API so that state IDs and immutable grammar versions make future branching possible.

A branch should never accidentally mutate the reasoning state of its parent.

**Implemented (2026-09-07):** two complementary mechanisms satisfy this.

- **Explicit fork** — the `fork` op clones a state's full immutable grammar history
  and a deep copy of its fragments into a new `state_id`, so hypotheses diverge
  independently. Compiled grammar objects are shared (read-only); fragments and
  `last_parse` are copied, so a child's `extend`/`add` never affects the parent.
- **Session-branch isolation** — the extension rebuilds state from
  `sessionManager.getBranch()` on `session_start`/`session_branch`/`session_tree`,
  so each omp conversation branch reconstructs only its own append-only entries.

---

# 17. Worker Protocol

The worker should communicate through JSON Lines (one JSON object per line).

Example request:

```json
{"id":1,"op":"create","grammar":"..."}
```

Example response:

```json
{"id":1,"ok":true,"state_id":"r1","grammar_version":1}
```

Example:

```json
{"id":2,"op":"add","state_id":"r1","fragment":"fact(A)"}
```

Example:

```json
{"id":3,"op":"parse","state_id":"r1"}
```

Response:

```json
{
  "id":3,
  "ok":true,
  "status":"AMBIGUOUS",
  "grammar_version":1,
  "alternatives":[
    "...",
    "..."
  ]
}
```

Requirements:

- stdout is protocol-only;
- diagnostics go to stderr;
- every request receives exactly one response;
- include a request ID;
- malformed requests produce structured errors;
- the worker remains alive across requests;
- the extension can restart the worker after unexpected termination.

The protocol should be independently testable without omp.

---

# 18. Worker Lifecycle

The omp extension should:

1. lazily start the worker when the first reasoning operation needs it;
2. maintain a persistent connection;
3. detect worker exit;
4. restart the worker;
5. reconstruct required reasoning state;
6. return a useful error if reconstruction fails.

Do not start a Perl process merely because omp loaded the extension.

---

# 19. Installation Strategy

The repository must be usable by an LLM working inside the repository.

The normal development flow should become:

```powershell
git clone ...
cd ...
npm install
npm test
```

Then local-install/link into omp.

The exact current omp installation/link command must be verified against the version installed on the development machine rather than assumed.

The repository should eventually provide a single documented command for development installation, such as:

```powershell
npm run install:omp
```

or an equivalent PowerShell script.

That command should:

1. build if necessary;
2. remove/replace the previous installed development version;
3. install/link the current extension;
4. verify that the extension is discoverable;
5. run a smoke test.

Do not require manual editing of omp configuration once the installation mechanism is established.

---

# 20. Reinstallation / Overwrite Requirement

A core requirement is:

> **The project can overwrite an older installed version of itself and verify the newly installed version.**

The installation script MUST be idempotent.

Running it twice should result in the same installed state as running it once.

The process must not accumulate:

```text
old copy
new copy
another old copy
```

without detection.

The installer should display:

```text
existing installation detected
removing/replacing
installed version X
verification passed
```

The test must verify that the loaded extension is the expected version/source.

---

# 21. Smoke Test

The first end-to-end smoke test should be intentionally tiny.

The test should prove:

```text
omp starts
  ↓
extension loads
  ↓
reason tool is visible to the model
  ↓
state can be created
  ↓
fragment can be added
  ↓
Marpa can parse
  ↓
result reaches the model
```

A second smoke test should prove ambiguity:

```text
create ambiguous grammar
  ↓
add ambiguous input
  ↓
parse
  ↓
AMBIGUOUS result returned
  ↓
at least two interpretations visible
```

A third smoke test should prove grammar replacement:

```text
grammar v1
  ↓
input fails or is insufficient
  ↓
extend to grammar v2
  ↓
reparse
  ↓
result changes appropriately
```

---

# 22. Development Milestones

> **Reconciled 2026-09-07.** The list below (M0–M7) predates the executable-language
> reframe. The authoritative roadmap is the revised list in §34 (Research Record):
> M0–M8 complete, M9–M13 complete, M14 (research experiments and baselines) planned
> in §36. This section is retained as the original design record. Mapping: original M6
> (Ruby Slippers) → revised M12 (recorded not-justified); original M7 (first research
> experiment) → revised M14.

## Milestone 0 — Environment verification

Goal: establish the development toolchain.

Tasks:

- verify Node/npm or the package manager used by the current omp installation;
- verify omp version;
- verify `perl --version`;
- install/verify `Marpa::R2`;
- run a minimal standalone Perl Marpa example;
- document the actual commands that work on Windows.

Exit criterion:

```text
Perl -> Marpa::R2 -> successful parse
```

with no omp involvement.

---

## Milestone 1 — Marpa worker

Build:

```text
worker/marpa-worker.pl
```

Implement:

- JSONL input/output;
- create state;
- add fragment;
- parse;
- grammar replacement;
- errors.

Tests must run without omp.

Exit criterion:

A test process can send JSON requests to the worker and receive deterministic parse results.

---

## Milestone 2 — Minimal omp extension

Create the smallest extension possible.

Register:

```text
reason
```

Implement only:

- create;
- add;
- parse.

Connect extension to worker.

Exit criterion:

The LLM can call `reason` and receive the parser's result.

---

## Milestone 3 — Ambiguity experiment

Implement explicit ambiguity reporting.

Create at least one tiny grammar whose ambiguity is intentional.

Exit criterion:

The LLM receives multiple alternatives and can continue reasoning based on them.

Do not add dynamic grammar modification yet.

---

## Milestone 4 — Persistent reasoning state

Add:

- state IDs;
- fragment log;
- grammar versions;
- omp session persistence/reconstruction;
- worker reconstruction.

Exit criterion:

A session can restart the extension and reconstruct the reasoning state.

---

## Milestone 5 — Dynamic grammar

Add:

```text
extend
```

Requirements:

- immutable grammar versions;
- validation before installation;
- current grammar pointer;
- reparsing of prior fragments;
- grammar-change metadata.

Exit criterion:

A reasoning state can move from grammar v1 to grammar v2 without losing history.

---

## Milestone 6 — Ruby Slippers exploration

Investigate the actual Marpa::R2 facilities needed to expose useful grammar-repair behavior.

Do not invent an abstraction before observing Marpa's real behavior.

Build the thinnest useful bridge between:

```text
parse failure / unexpected structure
```

and:

```text
candidate grammar repair
```

Exit criterion:

The LLM can receive a candidate structural repair, decide whether to accept it, and then create a new grammar version.

---

## Milestone 7 — First research experiment

Build a controlled benchmark comparing at least:

```text
A. ordinary LLM reasoning
B. LLM + reasoning tool + fixed grammar
C. LLM + reasoning tool + ambiguity
D. LLM + dynamic grammar
```

Measure at minimum:

- task success;
- total output tokens;
- tool calls;
- reasoning-state fragments;
- grammar modifications;
- unresolved ambiguities;
- recovery from intentionally ambiguous or underspecified tasks.

---

# 23. First Experimental DSL

The initial DSL must be tiny.

Candidate:

```text
fact(A)
depends(A,B)
missing(B)
```

A minimal grammar might express:

```text
statement ::= fact | depends | missing
```

Then later introduce reasoning rules.

Do not attempt to encode natural language directly.

The initial question is not whether Marpa can parse English.

The initial question is:

> Can an LLM productively use a small formal reasoning language when a generalized parser exposes the state of that language?

---

# 24. Experimental Method

Experiments should be deterministic where possible.

Each experiment should record:

```text
experiment id
model
model settings
prompt
initial grammar
grammar versions
reasoning fragments
tool calls
parser responses
final answer
success/failure
token counts
```

For local LLM testing, record the exact model identifier.

Do not mix model changes and architecture changes in the same experiment unless explicitly intended.

---

# 25. Baselines

At minimum, compare the reasoning system against:

## Baseline A — No reasoning tool

The model solves the task normally.

## Baseline B — Ordinary structured tool use

The model has tools but no external reasoning grammar.

## Experimental C — Fixed formal reasoning language

The model has a grammar-backed reasoning tool but cannot change its grammar.

## Experimental D — Dynamic formal reasoning language

The model can extend its grammar and reparse accumulated reasoning.

This isolates the contribution of:

```text
parser
ambiguity
dynamic grammar
```

instead of treating the entire architecture as one indivisible feature.

---

# 26. What Would Count as an Interesting Result?

The project does NOT need to prove that the architecture universally improves LLM performance.

Interesting results include:

### Positive result

The model reliably uses ambiguity feedback to seek information or revise reasoning rather than blindly choosing an interpretation.

### Representation result

The model discovers compact DSL representations that preserve useful reasoning state with fewer tokens.

### Adaptation result

The model productively extends the grammar in ways that improve subsequent reasoning.

### Failure result

The model ignores, abuses, or destabilizes the grammar mechanism.

A systematic failure is useful research if it reveals a boundary of the language/LLM interaction.

---

# 27. Important Non-Goals

Do not claim that:

- the parser reproduces the LLM's internal thought process;
- the parse forest is equivalent to the model's internal hypothesis distribution;
- explicit ambiguity is identical to neural uncertainty;
- a successful experiment proves machine consciousness or human-like metacognition;
- parser integration alone guarantees better reasoning.

The project studies an external computational representation and its interaction with an LLM.

---

# 28. Design Principles

1. **Parser mechanics must be deterministic and inspectable.**
2. **The LLM decides how to respond to parser feedback.**
3. **Grammar evolution is explicit and versioned.**
4. **Ambiguity is preserved until a policy resolves it.**
5. **Reasoning fragments are append-only by default.**
6. **No silent mutation of previous grammar versions.**
7. **Every important state transition is observable.**
8. **The first implementation should be easy to throw away.**
9. **Do not optimize before measuring.**
10. **Do not confuse the experimental DSL with Marpa itself.**

---

# 29. Suggested Initial Tool Contract

The first model-facing contract should be roughly:

```text
reason.create(grammar)
reason.add(state, fragment)
reason.parse(state)
reason.inspect(state)
reason.extend(state, grammar)
```

The model should receive descriptions that explicitly teach it:

- ambiguity is expected;
- ambiguous results are not failures;
- it may add evidence;
- it may ask other tools for information;
- it may extend the grammar;
- grammar changes create a new version;
- it should not claim a conclusion is structurally resolved when the tool says it remains ambiguous.

Keep the descriptions short. The purpose of the tool is to let the model discover useful behavior, not to prescribe a giant chain-of-thought procedure.

---

# 30. Safety / Correctness Boundary

The reasoning plugin is an experimental symbolic system.

It should never:

- execute arbitrary commands merely because they appear in a reasoning fragment;
- treat parsed text as trusted executable code;
- alter files outside its own state/repository without explicit tool use;
- silently alter its grammar based on arbitrary parser errors;
- suppress ambiguity to make a result appear decisive.

The parser is a representation engine, not an authority that makes real-world claims true.

---

# 31. Definition of Done for the Initial Proof of Concept

The proof of concept is complete when all of the following are true:

- [ ] omp loads the extension on Windows.
- [ ] The extension registers an LLM-callable `reason` tool.
- [ ] The extension can start a persistent Marpa worker.
- [ ] The worker can create a grammar.
- [ ] The worker can accept reasoning fragments.
- [ ] The worker can parse accumulated fragments.
- [ ] The worker can report an unambiguous result.
- [ ] The worker can report an ambiguous result.
- [ ] The LLM can inspect the competing interpretations.
- [ ] Grammar v1 can be replaced by grammar v2.
- [ ] Existing reasoning fragments can be reparsed under v2.
- [ ] Old grammar versions remain recoverable.
- [ ] The extension can reconstruct state after session restart.
- [ ] The repository has automated tests for the worker protocol.
- [ ] The repository has an omp integration smoke test.
- [ ] A single documented install command can replace an older local installation.
- [ ] A single documented test command verifies the installation.
- [ ] At least one experiment demonstrates the model responding to parser ambiguity.
- [ ] The experiment logs enough information to reproduce the behavior.

---

# 32. Immediate Implementation Order

When an LLM begins work in this repository, follow this order:

### Step 1

Read this PLAN.md completely before modifying files.

### Step 2

Inspect the local omp installation and current version.

Confirm the extension API against the installed/current omp documentation.

### Step 3

Verify the Windows Perl environment and install `Marpa::R2`.

### Step 4

Write a tiny standalone Perl program using Marpa::R2.

It must demonstrate:

- grammar creation;
- parsing;
- an intentionally ambiguous grammar;
- ambiguity inspection.

### Step 5

Write the JSONL worker.

Test it independently.

### Step 6

Create the smallest omp extension possible.

Register the `reason` tool and connect it to the worker.

### Step 7

Test the extension manually from omp.

### Step 8

Add persistent state and grammar versions.

### Step 9

Add dynamic grammar replacement.

### Step 10

Only then investigate Ruby Slippers support.

### Step 11

Run the first controlled LLM experiment.

### Step 12

Update this PLAN.md with findings before adding complexity.

---

# 33. Living-Document Rule

This document is part of the experiment.

When implementation reveals that an assumption is wrong:

1. do not hide the discrepancy;
2. update the relevant section;
3. record the old assumption and observed behavior when scientifically useful;
4. preserve architectural decisions that were falsified;
5. update milestones and tests.

The plan should converge toward what the system actually does rather than becoming a fictional description of an ideal architecture.

---

# 34. Research Record

Maintain a short dated record here as implementation progresses.

## 2026-09-06 — Initial plan

Initial hypothesis established:

> An LLM can use an ambiguity-preserving generalized grammar as an externalized reasoning state, treating grammar construction, ambiguity resolution, and grammar extension as operations in an iterative reasoning process.

Initial implementation choice:

```text
omp TypeScript extension
        ↓
persistent Perl worker
        ↓
Marpa::R2
```

Python bindings are explicitly deferred until the proof of concept establishes that the architecture is worth optimizing.

Current known omp extension references:

- https://github.com/can1357/oh-my-pi/blob/main/docs/extensions.md
- https://github.com/can1357/oh-my-pi/blob/main/docs/skills/authoring-extensions.md
- https://github.com/can1357/oh-my-pi/blob/main/docs/custom-tools.md

Current known Marpa references:

- https://metacpan.org/dist/Marpa-R2
- https://metacpan.org/dist/Marpa-R2/view/pod/Tutorial2.pod

## 2026-09-06 — Executable-language reframe

Reframed the core concept. The project is NOT primarily a validator for LLM output.
An LLM constructs an executable formal language, instantiates the machine for it,
then feeds a separately supplied input stream that the machine processes with
semantic actions producing observable state/output. The grammar is an installed
executable artifact, not a one-shot `parse(grammar, input)`.

What the first implementation proved: grammar construction, recognition, ambiguity
representation, dynamic grammar, and persistence — but only the *recognition*
layer. `parse` returns a parse tree; there was no semantic-action mechanism, and
the input was always the accumulated fragment list rather than an independent
stream.

New milestone — executable language runtime: a new `execute` operation takes an
explicit `input` stream and runs a fixed, safe semantic-action vocabulary against
the installed grammar, returning observable `output` and `vars`. The grammar is
compiled once (`Scanless::G`); each `execute` spins a fresh recognizer
(`Scanless::R` with `semantics_package`) over a fresh runtime, so one grammar
serves many independent streams without reconstruction.

Action vocabulary (fixed, no arbitrary Perl): `store` (set a variable), `add`
(increment a variable), `emit` (append "key=value" to output). Example executable
grammar `grammars/commands.slif`; input "set x 10 / add x 5 / print x" yields
output ["x=15"], vars { x: 15 }.

Revised roadmap:
1 Marpa worker (done) · 2 OMP extension (done) · 3 ambiguity representation (done)
4 persistent state (done) · 5 dynamic grammar (done) · 6 executable language runtime
(done) · 7 independent input streams (done, via `execute`) · 8 semantic actions /
observable effects (done, minimal vocabulary) · 9 ambiguous executable languages
10 LLM-driven ambiguity resolution · 11 grammar modification after runtime
failure/ambiguity · 12 Ruby Slippers (if still justified) · 13 branching/versioned
languages · 14 research experiments and baselines.

Open design question deferred to milestone 9: how `execute` should behave when the
grammar is ambiguous (side-effecting actions run per parse tree, so they must not
be silently multiplied). `execute` currently reports AMBIGUOUS and runs only the
first parse's actions.

## 2026-09-06 — Context emission (machine-generated text)

Added the context-emission primitive. The executable machine can now DELIBERATELY
produce text for the LLM, distinct from computed output and internal state:

- `vars` — internal semantic state (`store` / `add`).
- `output` — computed results (`print`).
- `emitted` — machine-generated context text (`emit`).

New action `emit`: joins the matched rule's right-hand-side values (literal
template words + captured lexemes) into one space-separated string, appended to
`emitted`. So `observation ::= 'conflict' ident 'and' ident action => emit` on
input "conflict alice and bob" emits "conflict alice and bob"; a single-literal
rule emits a fixed message. This is dynamic (interpolates parsed values) and
deterministic (multiple emissions appear in input order). The prior `emit` action
(which printed a variable's value) was renamed `print`.

Data flow: Marpa rule fires -> `Reason::emit` -> worker execute result
`{ emitted: [...] }` -> extension renders an "Emitted context:" section -> omp
tool result -> LLM context.

This milestone proves `machine -> text -> LLM-visible result`. It does NOT yet
prove the LLM USES that text to change its reasoning — that is the next
experiment. Tests: worker tests prove construct -> independent stream -> emitted
text (interpolation, multiple emissions, fixed literal); S5 smoke verifies the
model receives emitted text through omp (tightly controlled: the grammar is
supplied, because unprimed grammar construction is the deferred research
experiment).

## 2026-09-07 — Ambiguity-safe execute, commit, repair loop, Ruby Slippers gate

M9–M12 closed out the revised roadmap's remaining mechanism work (M13 and M14
still pending).

- **M9 — ambiguous executable languages.** `execute` now recognizes action-free
  first (via a `ReasonTrace` package of structural no-op stand-ins for the fixed
  action vocabulary, matching `::array`), so side-effecting actions never run on
  an ambiguous machine. AMBIGUOUS returns the numbered competing interpretations
  and empty effects; only an unambiguous input runs actions. Finding: Marpa
  resolves non-reserved `action =>` names only under a `semantics_package`, so the
  oracle must supply one — a recognizer with no `semantics_package` dies on
  `store`/`emit`/etc.

- **M10 — LLM-driven ambiguity resolution.** New `commit` op
  `{op, state_id, input, index}` selects the index-th interpretation (matching the
  numbered alternatives `execute` reported) and runs only that tree's actions.
  `value()` enumeration is deterministic, so index mapping is stable. Finding: with
  the fixed action vocabulary the distinguishing signal between interpretations is
  the structural rendering (S-expression), not effects — `emit` joins RHS values,
  so two parses of the same token stream produce identical emitted text.

- **M11 — grammar modification after runtime failure/ambiguity.** `execute`/`parse`
  INVALID now return a `progress` field (Marpa `show_progress()` dotted rules) in
  addition to the cleaned error, giving the LLM the expected productions to author
  a `v(n+1)` grammar and re-execute. Finding: `terminals_expected()` returns
  internal `Lex-N` ids (not readable); `show_progress()` is the readable source of
  expected structure.

- **M12 — Ruby Slippers: not justified.** Marpa::R2 does expose the pause/resume
  surface (`$recce->resume`, `$recce->pause_lexeme`), so the Ruby Slippers
  mechanism is technically available. It was NOT implemented: M11's
  `show_progress` expected-production diagnostics already give the LLM enough to
  author its own repair via `extend`, and the parser-side candidate-insertion
  bridge (pause adverbs + resume injection loop) adds complexity with no
  demonstrated research need. Deferred to future work (§35).

## 2026-09-07 — Milestone 14 research plan and one-pager

Added a concrete research plan for M14 (§36) and a research one-pager (§37). The plan
defines hypotheses H1–H5 and four experiments (constraint enforcement, compact
persistent state, dynamically constructed machine, ambiguity + adaptive repair), each
with explicit support/falsification criteria and a competitive baseline. No
experiments run yet.

## 2026-09-07 — Reframe: constructed computational machinery and search

Reframed the research direction (affects §2, §36, §37). The deepest question is now
"can an LLM construct, execute, observe, and iteratively refine specialized
computational machinery as part of its reasoning process?" — not "does parsing improve
reasoning". Made the normal-tool-use vs constructed-machinery distinction explicit, and
split "grammar" into five roles (schema, validator, executable procedure, search-space
representation, evolving artifact). Experiments now progress E1–E6, adding E4
(combinatorial search / iterative refinement, e.g. small TSP) — framed strictly as
externalizing search, not making it fast — and separating E5 (ambiguity/deferred
commitment) and E6 (runtime adaptation). E1's ceiling with gpt-oss:20b (zero ordering
errors ≤ n=26) is recorded as a scoping result. No experiments run yet.

## 2026-09-07 — E2 small-scale result (H2 falsified at small scale)

Ran E2 (compact persistent state) at small scale: a 9-task state over 7 turns on
gpt-oss:20b. Tool-free prose (A) used 1,745 tokens and was 9/9 accurate; the Aristotle
DSL (C) used 16,905–25,504 tokens and was 7/9–9/9 accurate — ~10–15× more tokens with
no accuracy benefit. H2 is falsified at small scale (prose is already compact and
reliable; the DSL's fixed overhead dominates). Confounder found and fixed: an
unconstrained prose model spontaneously used file tools and lost 8/9 tasks. Next: a
scale probe with a constrained context window to locate the crossover where the DSL
might overtake prose.

## 2026-09-07 — E2 scale probe (no clean crossover; verbosity dominates)

Scale probe: 50 items over 7 turns, context constrained to 2K and 4K (derived gpt-oss
variants). At both sizes both prose and DSL collapsed into task amnesia (0/51 items
retained, generic "how can I help you?" replies) — the window was below the task's own
footprint (grammar + init + model verbosity). At 4K the DSL was ~2.5× more
token-efficient than prose (22,784 vs 57,709), so its compactness is real and
directionally supports H2, but both exceeded the window. Conclusion: the
"context-window crossover" does not materialize cleanly — model verbosity dominates the
state-representation difference, and a window small enough to bind prose also binds the
DSL. H2 remains falsified at small scale and unproven (with a real but sub-dominant
token advantage) at scale.

---

# 35. Future Directions — Do Not Implement Yet

Potential later research directions include:

- weighted/probabilistic parse forests;
- explicit confidence attached to hypotheses;
- parser feedback used as a token-efficient representation;
- task-specific DSL synthesis;
- automatically learned grammar transformations;
- comparing natural-language reasoning with compressed formal reasoning;
- grammar branching;
- grammar merge operations;
- persistent reasoning across sessions;
- multiple cooperating reasoning languages;
- external facts attached to parse nodes;
- integration with tool-call planning;
- using ambiguity as a trigger for information gathering;
- measuring whether parser feedback changes model calibration;
- native Marpa bindings;
- alternative generalized parsers;
- comparison with PEG, LR, GLR, parser combinators, constraint systems, and logic programming.

These are explicitly deferred until the initial interaction model has produced evidence worth pursuing.

---

# 36. Milestone 14 — Research Plan

## 36.1 Core research question and framing

> **Can an LLM construct, execute, observe, and iteratively refine specialized
> computational machinery as part of its reasoning process?**

Explicitly **NOT** claimed: that LLMs cannot already reason; that "Marpa solves
NP-hard problems"; or that generalized parsing eliminates exponential search. The claim
under investigation is narrower than all three.

The proposed mechanism — the LLM does not have to hold and solve the whole problem in
its context. It can:

1. construct an executable language representing the problem and/or a useful solution
   space;
2. generate candidate structures;
3. have the machine efficiently reject invalid structures, preserve
   alternatives/ambiguity where appropriate, and execute semantic computations;
4. observe machine-generated context describing what happened;
5. refine the language, constraints, heuristics, or candidate solutions;
6. repeat until it reaches a satisfactory solution.

```
construct machine
      ↓
generate candidates ──→ executable grammar + semantic actions
      ↑                        │
      │            reject invalid / preserve ambiguity / compute
      │                        ↓
      │    machine-generated context (validity, cost, ambiguity, diagnostics)
      │                        ↓
      └────── refine language / constraints / candidates
```

INVALID, AMBIGUOUS, semantic-action output, execution results, and grammar extension
are all feedback channels. Generalized parsing matters because the initial language can
be deliberately broad or underspecified: ambiguity is *unresolved computational state*
(competing candidates), not an error.

### Normal tool use vs. constructed machinery

- **Normal tool use.** The LLM calls a *pre-existing* program to solve a problem — a
  calculator adds, a solver searches, a validator checks. The program is fixed; the LLM
  supplies input and reads output.
- **Aristotle hypothesis.** The LLM *constructs or modifies* the program/language that
  defines and explores the problem's computational representation, then uses the
  resulting machine as an external reasoning/search substrate.

A fixed solver already encodes the search; the open question is whether an LLM gains
leverage by building (and evolving) the computational representation itself.

### Grammar roles (what a grammar can be)

1. **Output schema** — states the shape the model's output must have.
2. **Validator** — rejects structures that violate stated constraints.
3. **Executable procedure** — semantic actions compute results over accepted input.
4. **Search-space representation** — delimits the set of candidate structures (valid
   tours, valid colorings); the machine rejects invalids and preserves alternatives.
5. **Evolving computational artifact** — the grammar is repeatedly modified by the LLM
   as its understanding of the problem changes.

Roles 4 and 5 are where the novel research direction lives; roles 1–3 are necessary but
sit close to existing structured-output and schema-validation work.

## 36.2 Hypotheses

- **H1 — Constraint enforcement.** A formal executable language can reduce malformed
  structured output and enforce plans more reliably than unconstrained generation.
- **H2 — Compact persistent state.** A compact executable representation can retain
  useful state or procedures more compactly/reliably than prose/context in long-running
  tasks.
- **H3 — Constructed computation.** An LLM will, unprompted, construct a specialized
  executable language when it provides computational leverage, and use it to perform
  computation that would otherwise remain in its reasoning/context.
- **H4 — Search-space externalization.** An LLM can encode a combinatorial search
  problem as an executable representation and use machine execution/feedback to
  eliminate or distinguish candidates and iteratively refine its search. The claim is
  about *externalizing* search, not making it fast.
- **H5 — Ambiguity as deferred commitment.** Generalized parsing (which preserves
  ambiguity) is more useful than deterministic validation when the problem
  representation is deliberately underspecified, because it lets the LLM defer rare
  conflicts until more information arrives.
- **H6 — Runtime-driven adaptation.** Parser/runtime feedback (INVALID, AMBIGUOUS) can
  cause the LLM to discover that its current language is insufficient, extend or modify
  it, and successfully continue.

## 36.3 Shared experimental discipline

1. **Start small and reproducible** — small, controlled experiments before any large
   benchmark. Each experiment must be runnable on a single machine with the existing
   smoke harness pattern (`omp -p --mode json`, JSONL capture).
2. **Competitive baseline** — every baseline must be capable of solving the task
   *without* Aristotle. We measure added value, not capability gating. A treatment
   that only "works" because the baseline is incapable is not evidence.
3. **No self-demonstration** — no experiment may merely demonstrate that Aristotle
   parses. The dependent variables must be task outcomes and cost, not "the tool ran".
4. **One variable at a time** — do not vary model and mechanism in the same experiment
   (§24). Record the exact model id and settings (§24).
5. **Explicit support/falsification** — each experiment states, in advance, what result
   supports the hypothesis and what result falsifies it. A null result is a valid and
   publishable outcome.
6. **Determinism where possible** — fixed prompts, fixed tasks, seed-repeated trials to
   estimate variance; record everything (below).

## 36.4 Logging requirements (all experiments)

Per trial, capture as JSONL (extending the existing `/tmp/smoke-*.jsonl` discipline):

- experiment id, model id + settings, exact prompt (system + user), task instance;
- initial grammar, every grammar version, every input stream/fragment;
- every tool call (op + args) and every parser response (status, values, emitted, vars);
- final answer, ground-truth success/failure, and any malformed-output/schema violations;
- token counts per turn and cumulative, plus wall-clock;
- a machine-readable "condition" tag so results can be grouped.

## 36.5 Experiment 1 — Constraint enforcement (H1)

> **Scoping result (2026-09-07).** The mechanism is validated: a grammar encoding the
> dependency DAG turns an out-of-order step into `INVALID` with `Expected:` diagnostics
> naming the missing earlier token. But gpt-oss:20b makes *zero* ordering errors across
> line/JSON formats up to 30 components and scrambled chains up to n=26 (deterministic
> correct output). The A/B on ordering is therefore at ceiling with this model. This is
> a *useful* result — it confirms the grammar enforces the constraint independently of
> the model, and it identifies plain topological ordering as too easy for this model to
> expose a benefit. Do **not** manufacture baseline errors or weaken the model to force
> a positive result; treat E1 as the controlled scoping experiment.

- **Task class.** Produce a structured multi-step artifact/plan with a mechanically
  checkable schema. Concrete candidate: given N components with dependencies, emit a
  build/deploy plan whose every step carries `(id, command, depends-on[], artifact)`,
  in a valid topological order. Ground-truth validity is machine-checkable (schema +
  ordering), independent of the LLM.
- **Baselines.** A = prompt-only generation (schema documented in the prompt). B =
  ordinary structured tool use (generic JSON-output/file tool + self-check, with the
  same schema documented).
- **Treatment.** C = Aristotle: the model constructs a grammar encoding the schema,
  executes the plan stream, and iterates on `VALID`/`INVALID` feedback.
- **Model(s).** One model per run. Start with the config-injected local model for cheap
  iteration; repeat with a more capable model if the local model cannot solve the
  baseline at all (see confounders).
- **Trials.** ≥10 distinct tasks per condition, repeated ≥2× for variance.
- **Independent variables.** Condition (A/B/C); task instance (random effect).
- **Dependent variables.** Task success; malformed-output count per attempt;
  retries/corrections; tokens (total and per task); tool calls; execution failures
  (Aristotle INVALID/AMBIGUOUS counts).
- **Success criteria.** C yields fewer malformed outputs *and* task success ≥ the best
  baseline, at a token cost no worse than a pre-specified multiple of B (e.g. ≤1.5×).
- **Confounders.** Schema leakage (the grammar itself documents the schema — A and B
  MUST receive equivalent schema documentation in the prompt); model capability floor
  (if the baseline cannot solve at all, the comparison is vacuous — use a model that
  solves the baseline at least part of the time).
- **Supports H1 if** C reduces malformed outputs or retries while matching/exceeding
  A/B success at acceptable cost.
- **Falsifies H1 if** C shows no reduction in malformed outputs versus schema-aware B
  (the external parser adds nothing over the LLM self-checking against the same
  schema), or C's cost exceeds its benefit.

## 36.6 Experiment 2 — Compact persistent state (H2)

> **Result at small scale (2026-09-07).** A 9-task state tracked over 7 turns on
> gpt-oss:20b. Tool-free prose (A) used **1,745 tokens and was 9/9 accurate**. The
> Aristotle DSL (C) used **16,905–25,504 tokens and was 7/9–9/9 accurate** — ~10–15×
> more tokens with no accuracy benefit. **H2 is falsified at small scale**: prose is
> already compact and reliable, and the DSL's fixed overhead (grammar construction +
> tool-call machinery) dwarfs its per-item compactness. Pilot note: an *unconstrained*
> prose model spontaneously reached for file tools and catastrophically lost 8/9 tasks
> — an artifact of tool misuse, not of prose per se.
>
> **Scale probe (2026-09-07).** 50 items over 7 turns, with the model context
> artificially constrained (`num_ctx` 2048 and 4096 variants of gpt-oss:20b). At both
> sizes **both conditions collapsed into task amnesia** (final replies were generic
> "how can I help you?"), 0/51 items retained — the window was smaller than the task's
> own footprint (grammar + init + model verbosity). At 4K the DSL was ~2.5× more
> token-efficient than prose (22,784 vs 57,709 tokens) — its compactness is *real* and
> directionally supports H2 — but both exceeded the window. **No clean "DSL succeeds,
> prose forgets" crossover**: a window small enough to bind prose also binds the DSL,
> because model verbosity dominates the state-representation difference.

- **Task class.** Long-running stateful task where state is repeatedly updated and
  consulted. Concrete candidate: a multi-turn tracker (e.g. project task board) over
  20–40 turns — add items, change status, query summaries — plus a mid-task "reload"
  that forces state reconstruction.
- **Baselines.** A = prose/context (state re-stated in natural language, appended).
  B = ordinary structured tool use (a plain key/value store via tools).
- **Treatment.** C = Aristotle: state encoded in a compact DSL, updated/queried via
  `store`/`add`/`emit`/`execute`.
- **Model(s).** One model per run.
- **Trials.** ≥5 long tasks (each task = many turns), repeated ≥2×.
- **Independent variables.** Condition; task.
- **Dependent variables.** Cumulative and per-turn tokens/context; final state accuracy
  vs ground truth; reconstruction errors after reload; task success; number of
  interactions.
- **Success criteria.** C achieves state accuracy and task success ≥ A at meaningfully
  lower cumulative token/context usage.
- **Confounders.** DSL structure advantage (A/B must get equivalent schema docs); state
  size (tasks must have state that genuinely exceeds a trivial threshold); prose-drift
  variance (seed-repeat).
- **Supports H2 if** C matches A's accuracy while using fewer tokens for state upkeep.
- **Falsifies H2 if** C's token savings are negligible, or C loses accuracy vs B (a
  plain KV store already captures the benefit; the executable DSL adds nothing).

## 36.7 Experiment 3 — Dynamically constructed reasoning machine (H3)

- **Task class.** A problem where a specialized computational procedure could
  plausibly help, with **no** instruction to build a language. Concrete candidate:
  audit a dependency graph for violations (cycles, missing deps), or compute a
  reachability/closure over a dataset. The task must be solvable without Aristotle.
- **Baselines.** A = ordinary reasoning (no tools). B = ordinary tool use.
- **Treatment.** C = Aristotle, with **no prescribed grammar**. The model decides
  whether to construct a language, what it represents, what input to feed it, and how
  to use the returned context. (The prompt mentions the `reason` tool exists; it does
  not dictate the grammar.)
- **Model(s).** One model; additionally run a capable model, since a weak model may
  simply never construct (informative in itself, but confounds "does construction help
  when it happens").
- **Trials.** ≥10.
- **Independent variables.** Condition; task; (optional) an explicit vs implicit
  permission-to-construct hint.
- **Dependent variables.** Whether it constructs (binary); grammar complexity/size;
  number of executions; volume of machine-generated context and whether that context
  appears in subsequent reasoning (qualitative + proxy: does the model consume emitted
  values in later decisions); task success vs baseline; tokens; tool calls.
- **Success criteria.** C ≥ baseline success, and in constructing runs the machine
  performs demonstrably useful computation (emitted context the model could not
  trivially reproduce, and which it actually uses) rather than serving as a scratchpad.
- **Confounders.** Construction overhead (the grammar is itself token cost); the
  "fancy scratchpad" failure mode; model ability to design any grammar.
- **Supports H3 if** constructing-and-executing runs beat the model's own
  non-constructing runs and the baselines, with the emitted context demonstrably
  influencing decisions.
- **Falsifies H3 if** the machine is used as a scratchpad with no measurable benefit
  (success ≈ baseline, or construction cost dominates) — construction is theater.

The critical question this experiment answers: *does the machine actually perform
useful computational work, rather than merely serving as a fancy scratchpad?*

## 36.8 Experiment 4 — Combinatorial search / iterative refinement (H4)

- **Task class.** A tractable combinatorial problem. Concrete candidate: small/medium
  Traveling Salesman Problem (e.g. 8–15 cities with a known optimal), also graph
  coloring or job scheduling. The model's job is to find a good/valid solution against
  a known reference.
- **Framing caveat (read carefully).** This is **not** "beat a dedicated TSP solver",
  and **not** "Marpa makes NP-hard problems easy." Generalized parsing eliminates
  nothing exponential. The claim is strictly about *externalization*: can the LLM
  encode the solution space as a grammar, and use machine execution/feedback to prune
  and refine — rather than doing the whole search in-context?
- **The grammar's role.** The language represents *valid* candidate structures (a tour
  visits each city once, only defined edges) and, via semantic actions, computes a
  candidate's cost. The machine rejects invalid candidates (`INVALID`), computes cost
  (`output`), and preserves competing partial candidates as `AMBIGUOUS`. The LLM narrows
  the search by extending the grammar with added constraints (e.g. "must include edge
  A–B").
- **Baselines.** A = direct LLM reasoning (construct a tour and cost it in-context).
  B = ordinary code/tooling (the LLM writes a brute-force/heuristic in a code sandbox).
  C = Aristotle: the LLM constructs the executable tour language. D (optional) = a
  *fixed* pre-built tour validator/DSL handed to the model (isolates construction from
  use).
- **Model(s).** One model per run.
- **Trials.** ≥10 distinct instances per condition.
- **Independent variables.** Condition; instance; instance size (8 vs 15 cities).
- **Dependent variables.** Solution quality (tour cost / gap to optimal); computation
  externalized (share of candidate rejection and cost computation done by the machine
  vs in-context — measured via tool calls and emitted context); tokens/context;
  iterations; tool calls; grammar version count (evolution); machine-generated context
  volume and use; number of INVALID/AMBIGUOUS states; whether the machine becomes
  *more* useful as refinement proceeds (a within-run trend).
- **Success criteria.** C reaches comparable-or-better solution quality than A while
  demonstrably externalizing search (the machine rejects candidates and computes costs
  that A had to hold in-context), at acceptable cost; and the machinery is refined over
  the run rather than built once and left static.
- **Confounders.** Construction overhead; the "passive scratchpad" failure (the LLM does
  the search in-context and merely logs tours through the tool); instance size (too
  small → brute-force trivial for A too; too large → C cannot finish).
- **Supports H4 if** the machine performs real pruning/cost computation that changes
  the LLM's subsequent choices, and solution quality vs A matches/exceeds with less
  in-context search.
- **Falsifies H4 if** construction is theater — the machine is a passive record, the
  LLM still does the search in-context, and overhead dominates with no quality benefit.

## 36.9 Experiment 5 — Ambiguity / deferred commitment (H5)

- **Task class.** A problem whose representation is deliberately underspecified at the
  start and only resolved by later information. Concrete candidate: a tour/schedule spec
  that does not yet pin down an edge or assignment, so multiple completions are valid
  until new evidence arrives.
- **Framing.** The specific question is whether *generalized parsing beats deterministic
  validation* here: a deterministic validator must reject an underspecified structure,
  while a generalized parser can accept it as ambiguous (competing candidates) and let
  the LLM defer the choice.
- **Conditions.** A = ordinary reasoning. B = deterministic validation (a strict
  grammar/validator that rejects the underspecified input). C = Aristotle generalized
  parsing (ambiguity preserved), with `commit` to resolve later.
- **Model(s).** One model.
- **Trials.** ≥10.
- **Independent variables.** Condition; task; when the underspecification resolves
  (early vs late).
- **Dependent variables.** Whether ambiguity is *detected and deferred* vs guessed
  through; resolution quality (was the eventual choice consistent with the evidence);
  tokens; tool calls; final task success.
- **Success criteria.** C defers and then resolves *correctly* more often than A (which
  guesses) and B (which forces an early, possibly wrong, commitment).
- **Confounders.** Tasks that are ambiguous in name but guessable in practice (a wrong
  guess must be costly); deterministic-vs-generalized differences must not be conflated
  with other treatment differences.
- **Supports H5 if** preserving ambiguity lets the LLM defer until enough evidence
  exists, and deferral improves resolution quality over both guessing (A) and early
  forcing (B).
- **Falsifies H5 if** the LLM guesses through ambiguity as often as baseline, or
  deferral yields no quality gain over deterministic early commitment.

## 36.10 Experiment 6 — Runtime-driven adaptation (H6)

- **Task class.** A multi-stage problem where a *later* stage introduces an input class
  the model's initial language cannot represent. Concrete candidate: stages 1–2 are
  well-modeled by a grammar; stage 3 introduces a new structure (a new entity type or
  field) the grammar rejects.
- **Framing.** A *genuine capability test*, not a scripted repair: the model is not told
  what will break or how to fix it. It must detect insufficiency from `INVALID`/
  `AMBIGUOUS` feedback and extend its own grammar.
- **Conditions.** A = ordinary reasoning (re-plan in prose). B = ordinary tool use
  (retry/regenerate) C = Aristotle (detect INVALID → extend grammar → re-execute).
- **Model(s).** One model.
- **Trials.** ≥10.
- **Independent variables.** Condition; magnitude of the change (additive field vs
  novel structure).
- **Dependent variables.** Recovery rate (fraction where the model notices insufficiency
  and continues successfully); grammar modifications made and whether they are *correct*
  (capture the new structure vs special-case the failing input); tokens; tool calls;
  final task success.
- **Success criteria.** C recovers on the new input class more often than A/B, with
  grammar modifications that genuinely extend the language rather than special-case the
  input.
- **Confounders.** The model may "fix" by constraining the input instead of extending
  the language; the change must be genuinely unanticipated (not scripted).
- **Supports H6 if** INVALID/AMBIGUOUS feedback triggers the LLM to extend its language
  and continue successfully, and the extension is general rather than a special case.
- **Falsifies H6 if** the model fails to notice insufficiency, or extends only to
  special-case the failing input, or recovery rate ≤ baseline.

## 36.11 Sequencing and go/no-go gates

Run roughly in order E1→E2→E3→E4 (E4 requires the machine's cost/validity/ambiguity
channels to be exercised). E5 and E6 depend on `commit`/`extend` and ambiguity handling
being well-understood, and can follow E4. Each experiment has a gate: if the small
version shows no signal **and** no obvious design fix, record the null result and move
on. E1 is explicitly a scoping experiment whose ceiling result is already recorded.

---

# 37. RESEARCH ONE-PAGER / ELEVATOR PITCH

## 37.1 The 60-second pitch

> Most tools are fixed: an LLM calls a calculator or a solver that someone else already
> built. Aristotle tests a different idea — that an LLM can *construct and revise its
> own computational machinery* as part of reasoning. The model writes an executable
> language (a grammar plus a runtime), feeds it candidates, and reads back machine
> feedback: what's invalid, what's ambiguous, what a candidate costs. When the language
> is wrong or too narrow, the model changes it and re-runs.
>
> The interesting case isn't simple constraint-checking — it's search. An LLM can
> represent the solution space of a hard combinatorial problem as a grammar, generate
> candidates, and let the machine reject the invalid ones, preserve competing
> alternatives, and compute results — refining the machine as it learns. The parser
> doesn't make the search faster; it makes the model's own search machine-checked and
> external.
>
> We've built the machinery and verified it end to end. What we have not shown is that
> any of this measurably helps on a real task. That's the experiment.

## 37.2 One-page explanation

1. **The problem.** LLM reasoning lives in natural language: expressive but
   unstructured, hard to validate, and — over long or hard tasks — token-hungry and
   drift-prone. Errors (including in its own reasoning process) are caught only when the
   model happens to re-read its output.

2. **The core idea.** Let the LLM externalize part of its reasoning as *formal,
   executable machinery it designs itself* — a grammar plus a runtime — and use that
   machine to process candidates with guaranteed, deterministic checking and
   computation.

3. **How it differs from ordinary tool use (the key distinction).** Ordinary tools are
   fixed: the LLM *calls* a pre-existing program. Aristotle's hypothesis is that the LLM
   *constructs or modifies the program itself* — the language that defines and explores
   the problem's representation — then uses the resulting machine as a substrate. Not
   "call a fixed function"; "define and compile a small machine."

4. **Why generalized parsing / Marpa.** A conventional parser rejects anything not in
   the grammar; a *generalized* parser preserves *all* parses and reports ambiguity as
   data. That lets the language be intentionally broad/underspecified and still useful —
   ambiguity becomes *unresolved computational state*, not an error.

5. **Why dynamically constructed languages matter.** A fixed grammar must be specified
   in advance by someone else. Here the model builds the language when it needs it and
   evolves it as the task unfolds — the grammar is *state*, not configuration.

6. **Why ambiguity can be a feature.** Ambiguity means competing structures are
   preserved. The model can defer choices until evidence arrives, and narrow the
   language by adding constraints. Underspecification is a strategy, not a bug.

7. **Practical utility cases.** (a) enforcing schemas; (b) validating multi-step plans;
   (c) compact persistent state across long tasks; (d) token reduction via dense
   grammars/DSLs; (e) reusable executable procedures; and (f) *representing a search
   space* — a grammar delineating valid candidate structures that the machine rejects
   or preserves.

8. **The deeper question.** Not "does parsing improve reasoning?", but: *can an LLM
   construct, execute, observe, and iteratively refine specialized computational
   machinery as part of its reasoning process?* Most provocatively, can it externalize
   part of a combinatorial search — building the representation it searches with, not
   merely calling a solver?

9. **What Aristotle currently demonstrates (built, not yet proven useful).**
   End-to-end infrastructure: construct a versioned grammar; execute independent input
   streams with a fixed semantic-action vocabulary (`store`/`add`/`print`/`emit`);
   detect and enumerate ambiguity; `commit` to one interpretation; `extend` the grammar
   after failure; `fork` diverging hypotheses. All deterministic, tested, smoke-verified
   through omp.

10. **What remains to be experimentally established.** That any of this produces a
    *measurable* benefit over a competitive baseline. This is unproven. The research
    plan (§36) now specifies six experiments (E1–E6) with explicit support/falsification
    criteria. E1's ordering constraint is already at ceiling with gpt-oss:20b (which
    makes zero ordering errors ≤ n=26) — that ceiling is itself a recorded result.

## 37.3 Claim discipline (what each assertion is)

| Statement | Status |
|---|---|
| Grammar construction, execution, ambiguity, commit, extend, fork work end to end | **Demonstrated** (tests + smoke, M0–M13) |
| A grammar encoding a DAG catches ordering violations (`INVALID` + `Expected:` diagnostics) | **Demonstrated** (E1 mechanism validation) |
| gpt-oss:20b makes zero ordering errors on topological sort (≤ n=26 chains, ≤ 30 comps) | **Demonstrated** (E1 calibration) — a ceiling, recorded |
| The machine performs *useful* computation that changes outcomes vs baselines | **Hypothesis (unproven)** — H3 |
| Executable languages reduce malformed output / enforce plans | **Hypothesis (unproven)** — H1 (ceiling with this model) |
| Compact DSL state reduces tokens without losing accuracy | **Hypothesis (unproven)** — H2 |
| The LLM externalizes a combinatorial search into the machine with a quality benefit | **Hypothesis (unproven)** — H4 |
| Generalized parsing beats deterministic validation for deferred commitment | **Hypothesis (unproven)** — H5 |
| INVALID/AMBIGUOUS feedback drives general (non-special-cased) language extension | **Hypothesis (unproven)** — H6 |
| Aristotle improves an LLM agent on a real task | **Unproven** |

Do not cite any "unproven" row as established. In particular, no mention of NP-hard
problems, TSP, or search should imply that Marpa makes hard search easy — the claim is
about *externalizing* search, never about eliminating its cost.
