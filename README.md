# OMP + Marpa Reasoning POC

An omp TypeScript extension that registers an LLM-callable `reason` tool backed by a
persistent Perl worker running Marpa::R2. The tool exposes `create` / `add` /
`parse` / `inspect` / `extend` / `execute` / `commit` / `fork` / `reset` over versioned,
immutable grammars, and reports ambiguity as first-class data (`VALID` / `AMBIGUOUS` /
`INVALID`).

A grammar is an installed, executable artifact: `create`/`extend` construct the language,
and `execute` feeds an independent input stream that runs a fixed semantic-action
vocabulary against it, returning three kinds of observable result:

- `vars` — internal state (`store` / `add`),
- `output` — computed results (`print`),
- `emitted` — machine-generated context text returned to the LLM (`emit`).

Example (`grammars/commands.slif`): input `set x 10 add x 5 print x` yields
`output: ["x=15"]`, `vars: { x: 15 }`. Example (`grammars/observation.slif`): input
`conflict alice and bob` yields `emitted: ["conflict alice and bob"]`.

## Status & research findings

Infrastructure (M0–M13) is complete and tested: grammar construction, versioned dynamic
grammar (`create`/`extend`), independent-stream execution with a fixed semantic-action
vocabulary (`store`/`add`/`print`/`emit`), ambiguity detection and enumeration, `commit`
(select one interpretation), `fork` (branch state), and session
persistence/reconstruction — all smoke-tested end-to-end through omp.

Research experiments (M14) are partially complete. Against the config-injected local
model (`ollama/gpt-oss:20b`), the recurring result is that the model is already competent
at the small structured tasks the current machine can assist with, so the machine adds
no measurable benefit:

- **E1 — constraint enforcement.** Ceiling: the model makes zero ordering errors even at
  n=26, so a grammar-encoded constraint has nothing to catch (the mechanism itself is
  validated).
- **E2 — compact persistent state.** Falsified at small scale: prose is ~10–15× more
  token-efficient than the DSL at equal accuracy; at scale, model verbosity dominates.
- **E4 — search externalization.** The model finds the 10-city TSP optimum in-context;
  the machine only sums costs (redundant with the model's own arithmetic).
- **E5 — ambiguity / deferred commitment.** The ambiguity + `commit` mechanism works and
  the model *does* use it, but it is redundant with prose, which also defers correctly.
- **E5-scale — external set representation.** The machine reports a large set of parse
  alternatives compactly (`AMBIGUOUS, 21,318 interpretations`), and — for an arbitrary
  grammar with no recognized closed-form — the model *cannot* compute that cardinality in
  prose (it hallucinated 5.3M vs the true 728; fell back to Catalan 429 vs 21,318). This
  is the first measured case where the machine's generalized-parsing edge is genuinely
  useful: the LLM cannot reason about the set's size without it. (Caveat: this is about
  structural parse alternatives, not constraint-solving — Sudoku was analyzed and
  rejected because its possibilities are value assignments, not parse ambiguity.)
- **Incremental constraint filtering.** Maintains an unresolved composition space
  (429 alternatives) and filters it via a sequence of grammar-extension constraints
  (429 → 42 → 1), each count exact and verified against the closed form; the constraints
  are pure grammar-language restriction, not solver code. Demonstrated on a composition-
  order "schedule" (genuine job-shop scheduling was analyzed and rejected for the same
  reason as Sudoku: its alternatives are distinct solutions, not parse ambiguity).

The one capability the model chose to externalize is ambiguity preservation — the
machine's distinctive generalized-parsing edge. Full hypotheses, method, and
falsification criteria live in `OMP_Marpa_Reasoning_POC_PLAN.md` §36–§37.

Pending experiments: **E3** (constructed computation — no grammar prescribed) and **E6**
(runtime-driven adaptation).

## Prerequisites

- **Perl + a C toolchain** (`gcc` + `make`) — needed to compile `Marpa::R2`.
  - macOS: `brew install perl`
  - Debian/Ubuntu: `sudo apt install perl gcc make`
- **`Marpa::R2`** (CPAN module) — install via `npm run setup` below.
- **Node 22+** — runs the test runner, typecheck, and install scripts.
- **omp** — `npm run install:omp` registers the extension into your omp config.

## Setup

```bash
npm install        # typescript + @types/node (dev only; no runtime deps)
npm run setup      # verifies perl/Marpa::R2 or installs Marpa::R2 via cpanm (idempotent)
```

`setup` honors a `MARP_PERL=<path>` env override to select a specific interpreter; if
`perl` is missing it prints distro-specific install instructions and exits with a clear
error (it does **not** install a Perl distribution for you).

## Test

```bash
npm run typecheck  # npx tsc --noEmit
npm test           # worker protocol + state tests (spawns perl directly, no omp)
```

## Install into omp (idempotent)

```bash
npm run install:omp
```

Runs `npx tsc --noEmit`, then ensures this repo's absolute path is listed under an
`extensions:` key in `~/.omp/agent/config.yml`, then verifies the entry is present.
Safe to re-run.

## Smoke test (end-to-end, uses the configured local task model)

```bash
npm run smoke
```

Runs seven scenarios headlessly (`omp -p --mode json`): basic parse, ambiguity, dynamic
grammar (`INVALID` → extend v2 → `VALID`), session-restart persistence, context emission,
ambiguity commit, and runtime repair (`execute INVALID` → extend → `execute VALID`). Use
`SMOKE_MODEL` to override the model (default `ollama/gpt-oss:20b`); `SMOKE_RUN=N` runs a
single scenario.

## Turn parser (opt-in)

A second extension, `src/turn-parser-extension.ts`, feeds each completed assistant turn into
a dangling-else grammar and injects a compact parser summary into context (the M14
incrementality experiment). It is **off by default** so it never leaves artifacts in sessions
that are not doing turn-parsing work. Enable it by setting `ARISTOTLE_TURN_PARSER=1` in the
omp process environment:

```sh
ARISTOTLE_TURN_PARSER=1 omp --extension ./src/turn-parser-extension.ts
```

## Windows

Native Windows uses the PowerShell helpers: `npm run setup:win` (installs Strawberry Perl
+ `Marpa::R2` via winget/cpanm) and `npm run install:omp:win`. The shell scripts
(`setup`, `install:omp`) target Linux/macOS; on Windows run them under WSL with a
Linux Perl, or use the PowerShell helpers directly.

## Layout

- `src/extension.ts` — omp extension entry (registers `reason`)
- `src/worker-client.ts` — JSONL client for the Perl worker
- `src/state.ts` — durable reasoning-state model + session reconstruction
- `src/tool-description.ts` — LLM-facing tool contract + SLIF cheat-sheet
- `src/turn-parser.ts`, `src/turn-parser-extension.ts` — opt-in turn parser (M14; off by default)
- `worker/marpa-worker.pl` — Marpa::R2 worker
- `grammars/*.slif` — example grammars (dependency, ambiguity, ambiguous-exec, commands, observation)
- `scripts/setup-env.sh`, `scripts/install-omp.sh`, `scripts/smoke.ts`
- `scripts/setup-env.ps1`, `scripts/install-omp.ps1` — Windows-only helpers
- `scripts/experiment1.ts` … `scripts/experiment5.ts` — research experiment harnesses
- `tests/` — worker protocol + state tests
- `docs/manual-smoke.md` — manual walkthrough