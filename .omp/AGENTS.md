# Aristotle Project

## Purpose

Explore grammar-guided coordination and structured reasoning
using Marpa parsing and LLM-generated grammars.

## Research Standards

- Distinguish mechanism validation from capability claims.
- Record model, prompt, grammar, and execution configuration.
- Preserve experiment outputs and failure cases.
- Avoid interpreting a single successful trial as general evidence.

## Implementation

- Inspect existing architecture before changing interfaces.
- Preserve ambiguity information when it is part of the experiment.
- Treat INVALID results as observable experiment data.
- Test both valid and adversarial model outputs.

## Verification

- Run focused tests for parser and execution changes.
- Verify that side effects are not performed before ambiguity resolution.
- Report model timeouts and tool-call failures separately from parser failures.