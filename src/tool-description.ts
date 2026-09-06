// LLM-facing description of the `reason` tool, including a minimal SLIF cheat-sheet
// and the dependency example grammar inline.

const EXAMPLE_GRAMMAR = [
  ":default ::= action => ::array",
  ":start ::= statements",
  "statements ::= statement+",
  "statement ::= fact | dependency | missing",
  "fact ::= 'fact' '(' symbol ')'",
  "dependency ::= 'depends' '(' symbol ',' symbol ')'",
  "missing ::= 'missing' '(' symbol ')'",
  "symbol ~ [A-Za-z_]+",
  ":discard ~ whitespace",
  "whitespace ~ [\\s]+",
].join("\n");

export const TOOL_DESCRIPTION = `Operate an ambiguity-preserving reasoning state backed by a generalized parser (Marpa).
Each state holds an immutable versioned grammar and an append-only list of fragments.

Operations ("operation" parameter):
- create: make a new state from a grammar (grammar v1). Returns a state_id. "state_id" may be omitted.
- add: append one fragment (one statement/line) to a state. Does NOT parse.
- parse: parse accumulated fragments under the current grammar; returns VALID, AMBIGUOUS, or INVALID.
- inspect: report grammar version, fragment count, and the last parse result for a state.
- extend: install a NEW complete grammar (v(n+1)); reparse existing fragments under it.
- reset: delete a state.

Grammar format (Marpa Scanless SLIF):
- ":start ::= <rule>" marks the start rule.
- "rule ::= alt1 | alt2" lists alternatives; "rule+" means one-or-more.
- 'literal' matches literal text; "name ~ [A-Za-z_]+" defines a lexeme (regex character class).
- ":default ::= action => ::array" makes rule values structured (required for parse output).
- ":discard ~ whitespace" / "whitespace ~ [\\s]+" discards whitespace between tokens.

Example grammar:
${EXAMPLE_GRAMMAR}

Important:
- AMBIGUOUS is expected data, NOT a failure: it means multiple structural interpretations exist.
- Never claim a conclusion is structurally resolved while the result is AMBIGUOUS.
- You may resolve ambiguity by adding more fragments/evidence, asking other tools, or extending the grammar.
- "extend" takes the complete new grammar source; every grammar change creates a new immutable version (old versions are retained for comparison).`;
