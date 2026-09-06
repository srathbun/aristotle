# Manual smoke walkthrough

Interactive/headless verification of the `reason` tool, mirroring the automated
`npm run smoke` scenarios. Run each from `F:\aristotle`.

Prerequisite: Strawberry Perl + Marpa::R2 installed (`scripts/setup-env.ps1`).

## S1 — basic parse (VALID)

```powershell
omp -p --auto-approve -e src/extension.ts "Call the reason tool: create a state with a grammar whose start rule accepts statements, then add fragments 'fact(A)' and 'depends(A,B)', then parse, then report the status."
```

Expected: a `reason` result reporting `Parse VALID`.

## S2 — ambiguity (AMBIGUOUS)

```powershell
omp -p --auto-approve -e src/extension.ts "Call the reason tool: create a state with the arithmetic grammar ':default ::= action => ::array / :start ::= expr / expr ::= term action => ::first / expr ::= expr '+' expr / expr ::= expr '*' expr / term ~ [\d]+ / :discard ~ whitespace / whitespace ~ [\s]+' (rules separated by newlines), add the fragment '1+2*3', then parse, and report the status."
```

Expected: `Parse AMBIGUOUS` with at least two interpretations — the two parenthesizations
of `1+2*3`.

## S3 — dynamic grammar (INVALID → extend → VALID)

1. Create a state with the dependency grammar, add `causes(A,B)`, parse → `INVALID`.
2. `extend` with a grammar that adds `cause ::= 'causes' '(' symbol ',' symbol ')'`.
3. Parse again → `VALID`, grammar v2.

## Persistence

1. Run S1 without `--no-session` (session is saved).
2. Continue the session and inspect:

```powershell
omp -p -c --auto-approve -e src/extension.ts "Call the reason tool: inspect state_id r1 and report its fragment count."
```

Expected: the state is reconstructed with the fragments from the prior session.
