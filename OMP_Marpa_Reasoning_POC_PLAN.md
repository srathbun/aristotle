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

The project investigates whether:

> **An LLM can use an ambiguity-preserving generalized grammar as an externalized reasoning state, treating grammar construction, ambiguity resolution, and grammar extension as operations in an iterative reasoning process.**

The parser is not intended to "think for" the LLM. Instead, it provides a formal environment in which the LLM can:

1. construct representations;
2. add observations and hypotheses;
3. ask whether its current representation is structurally valid;
4. inspect competing interpretations;
5. obtain feedback about unresolved ambiguity;
6. gather additional information;
7. revise its representation;
8. extend the language when the existing grammar is inadequate;
9. reparse accumulated reasoning under the new language.

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
