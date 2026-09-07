# OMP + Marpa Reasoning POC

An omp TypeScript extension that registers an LLM-callable `reason` tool backed by a
persistent Strawberry Perl worker running Marpa::R2. The tool exposes `create` / `add` /
`parse` / `inspect` / `extend` / `execute` / `reset` over versioned, immutable grammars,
and reports ambiguity as first-class data (`VALID` / `AMBIGUOUS` / `INVALID`).

A grammar is an installed, executable artifact: `create`/`extend` construct the language,
and `execute` feeds an independent input stream that runs a fixed semantic-action
vocabulary (`store`/`add`/`emit`) against it, returning observable `output` and `vars`.
Example (`grammars/commands.slif`): the input `set x 10 / add x 5 / print x` yields
`output: ["x=15"]`, `vars: { x: 15 }`.

## Prerequisites

- omp (tested on 18.1.12)
- Node 22+ (test runner + typecheck)
- Strawberry Perl + `Marpa::R2` (installed by the setup script)

## Setup

```powershell
scripts/setup-env.ps1   # installs Strawberry Perl + Marpa::R2 (idempotent; may prompt for admin)
npm install             # typescript + @types/node (dev only; no runtime deps)
```

## Test

```powershell
npm run typecheck       # npx tsc --noEmit
npm test                # worker protocol + state tests (spawns perl directly, no omp)
```

## Install into omp (idempotent)

```powershell
npm run install:omp
```

Detects an existing install, removes/replaces it, links the current repo, and verifies
discoverability.

## Smoke test (end-to-end, uses the configured local task model)

```powershell
npm run smoke
```

Runs four scenarios headlessly (`omp -p --mode json`): basic parse, ambiguity, dynamic
grammar (`INVALID` → extend v2 → `VALID`), and session-restart persistence. Use
`SMOKE_MODEL` to override the model (default `ollama/gpt-oss:20b`).

## Layout

- `src/extension.ts` — omp extension entry (registers `reason`)
- `src/worker-client.ts` — JSONL client for the Perl worker
- `src/state.ts` — durable reasoning-state model + session reconstruction
- `src/tool-description.ts` — LLM-facing tool contract + SLIF cheat-sheet
- `worker/marpa-worker.pl` — Marpa::R2 worker
- `grammars/*.slif` — example grammars (dependency, ambiguity, commands)
- `scripts/setup-env.ps1`, `scripts/install-omp.ps1`, `scripts/smoke.ts`
- `tests/` — worker protocol + state tests
- `docs/manual-smoke.md` — manual walkthrough
