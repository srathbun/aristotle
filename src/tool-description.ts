// LLM-facing description of the `reason` tool, including a minimal SLIF cheat-sheet,
// the dependency example grammar, and the fixed semantic-action vocabulary.

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

const COMMANDS_GRAMMAR = [
  ":default ::= action => ::array",
  ":start ::= program",
  "program ::= command*",
  "command ::= set_cmd | add_cmd | print_cmd",
  "set_cmd ::= 'set' ident num    action => store",
  "add_cmd ::= 'add' ident num    action => add",
  "print_cmd ::= 'print' ident    action => emit",
  "ident ~ [A-Za-z_]+",
  "num ~ [0-9]+",
  ":discard ~ whitespace",
  "whitespace ~ [\\s]+",
].join("\n");

export const TOOL_DESCRIPTION = `Operate an ambiguity-preserving reasoning state backed by a generalized parser (Marpa).
Each state holds an immutable versioned grammar. A grammar is an installed, executable artifact:
it can be CONSTRUCTED once and then process many independent input streams.

Operations ("operation" parameter):
- create: construct a state from a grammar (grammar v1). Returns a state_id. "state_id" may be omitted.
- add: append one fragment (one statement/line) to a state's accumulated fragment list. Does NOT parse.
- parse: parse the accumulated fragments under the current grammar; returns VALID, AMBIGUOUS, or INVALID (structural only, no side effects).
- execute: process an INDEPENDENT input stream ("input" parameter) against the installed grammar, running semantic actions; returns status plus observable "output" and "vars".
- inspect: report grammar version, fragment count, and the last parse result for a state.
- extend: install a NEW complete grammar (v(n+1)); reparse existing fragments under it.
- reset: delete a state.

Grammar format (Marpa Scanless SLIF):
- ":start ::= <rule>" marks the start rule.
- "rule ::= alt1 | alt2" lists alternatives; "rule+" means one-or-more.
- 'literal' matches literal text; "name ~ [A-Za-z_]+" defines a lexeme (regex character class).
- ":default ::= action => ::array" makes rule values structured (required for parse output).
- ":discard ~ whitespace" / "whitespace ~ [\\s]+" discards whitespace between tokens.

Semantic actions (available only to "execute"; fixed vocabulary, no arbitrary code):
- "action => store" — rule of shape ('set' ident num): set variable ident = num.
- "action => add" — rule of shape ('add' ident num): variable ident += num.
- "action => emit" — rule of shape ('print' ident): append "ident=value" to output.

Executable example grammar:
${COMMANDS_GRAMMAR}

Running execute with input:
  set x 10
  add x 5
  print x
produces output ["x=15"] and vars { x: 15 }.

Recognition example grammar:
${EXAMPLE_GRAMMAR}

Important:
- AMBIGUOUS is expected data, NOT a failure: it means multiple structural interpretations exist.
- Never claim a conclusion is structurally resolved while the result is AMBIGUOUS.
- You may resolve ambiguity by adding more fragments/evidence, asking other tools, or extending the grammar.
- "extend" takes the complete new grammar source; every grammar change creates a new immutable version (old versions are retained for comparison).
- "execute" is how a constructed language becomes a machine: construct the grammar once, then feed it independent input streams.`;
