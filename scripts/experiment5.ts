// Experiment 5 — ambiguity / deferred commitment (H5).
// An expression with two genuinely ambiguous interpretations; a later clarification
// picks one. Compare A (prose) vs C (Aristotle ambiguity + commit) on final correctness.
import { spawnSync } from "node:child_process";

const MODEL = process.env.E5_MODEL ?? "ollama/gpt-oss:20b";

function runTurn(prompt: string, sessionId?: string): { sessionId: string | null; text: string; tokens: number; toolCalls: number } {
  const args = ["-p", "--mode", "json", "--auto-approve", "--thinking", "off", "--model", MODEL];
  if (sessionId) args.push("--resume", sessionId);
  args.push(prompt);
  const r = spawnSync("omp", args, { cwd: "F:/aristotle", encoding: "utf8", timeout: 600_000, maxBuffer: 200 * 1024 * 1024 });
  let sessionIdOut: string | null = null;
  let text = "";
  let tokens = 0;
  let toolCalls = 0;
  for (const line of (r.stdout ?? "").split("\n")) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { continue; }
    if (typeof parsed !== "object" || parsed === null) continue;
    const ev = parsed as Record<string, unknown>;
    if (ev.type === "session" && typeof ev.id === "string") sessionIdOut = ev.id;
    if (ev.type === "message_end" && typeof ev.message === "object" && ev.message !== null) {
      const msg = ev.message as Record<string, unknown>;
      if (msg.role === "assistant") {
        if (Array.isArray(msg.content)) {
          let joined = "";
          for (const item of msg.content) {
            if (typeof item === "object" && item !== null) {
              const p = item as Record<string, unknown>;
              if (p.type === "text" && typeof p.text === "string") joined += p.text;
            }
          }
          if (joined.trim()) text = joined;
        }
        if (typeof msg.usage === "object" && msg.usage !== null) {
          const u = msg.usage as Record<string, unknown>;
          if (typeof u.input === "number") tokens += u.input;
          if (typeof u.output === "number") tokens += u.output;
        }
      }
    }
    if (ev.type === "tool_execution_end") toolCalls++;
  }
  return { sessionId: sessionIdOut, text, tokens, toolCalls };
}

function runSession(turns: string[]): { text: string; tokens: number; toolCalls: number } {
  let sid: string | null = null;
  let totals = 0;
  let toolCalls = 0;
  let final = "";
  for (const p of turns) {
    const r = runTurn(p, sid ?? undefined);
    if (r.sessionId) sid = r.sessionId;
    totals += r.tokens;
    toolCalls += r.toolCalls;
    final = r.text;
  }
  return { text: final, tokens: totals, toolCalls };
}

// Two clarification directions for the same ambiguous expression.
// std ("multiply first") -> 10 + (2*3) = 16; ltr ("left to right") -> (10+2)*3 = 36.
const VARIANTS: Array<{ label: string; clarify: string; correct: number }> = [
  { label: "std(mult-first)", clarify: "The intended precedence is: multiplication before addition.", correct: 16 },
  { label: "ltr(left-to-right)", clarify: "The intended precedence is strict left-to-right.", correct: 36 },
];

const turnsA = (clarify: string): string[] => [
  `Evaluate: 10 + 2 * 3. Note: the operator precedence is not specified, so there may be more than one plausible value. List the possible values and the final value you would report.`,
  `The intended precedence is now specified: ${clarify} Give the final value.`,
];

const turnsC = (clarify: string): string[] => [
  `Use the "reason" tool to detect the ambiguity in the expression 10 + 2 * 3. Create a state with an ambiguous grammar (":default ::= action => ::array / :start ::= expr / expr ::= term action => ::first / expr ::= expr '+' expr / expr ::= expr '*' expr / term ~ [0-9]+ / :discard ~ whitespace / whitespace ~ [ ]+", rules separated by newlines), then execute input "10 + 2 * 3". Report the status (how many interpretations) and their renderings. Do NOT decide the value yet.`,
  `The intended precedence is now specified: ${clarify} Use "commit" on the correct interpretation, then give the final value.`,
];

for (const v of VARIANTS) {
  for (const [label, turns] of [["A (prose)", turnsA(v.clarify)], ["C (Aristotle)", turnsC(v.clarify)]] as const) {
    const r = runSession(turns);
    console.log(`\n== ${v.label} / ${label.slice(0,1)}  (correct=${v.correct}) ==`);
    console.log(`  tokens=${r.tokens} toolCalls=${r.toolCalls}`);
    console.log("  " + r.text.slice(0, 300).replace(/\n/g, " "));
  }
}