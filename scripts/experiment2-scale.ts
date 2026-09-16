// E2 scale probe — does the DSL overtake prose when context is the binding constraint?
// 50 items, 7 turns, on a 2K-context model. DV: item retention in the final report.
import { spawnSync } from "node:child_process";

const MODEL = process.env.E2_MODEL ?? "ollama/gpt-oss-2k:latest";

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

// ---- 50 items, deterministic statuses ----
const N = 50;
function statusWord(i: number): string {
  return i % 3 === 0 ? "done" : i % 3 === 1 ? "todo" : "in-progress";
}
function statusCode(i: number): number {
  return i % 3 === 0 ? 2 : i % 3 === 1 ? 0 : 1;
}

const initProse = Array.from({ length: N }, (_, i) => `item${i + 1}=${statusWord(i + 1)}`).join(", ");
const initDsl = Array.from({ length: N }, (_, i) => `set item${i + 1} ${statusCode(i + 1)}`).join(" ");

// expected final item ids: 1..50 minus removed(40), plus added(51,52)
const removed = 40;
const expected = new Set<number>();
for (let i = 1; i <= 50; i++) if (i !== removed) expected.add(i);
expected.add(51);
expected.add(52);

const TURNS_A = [
  `You are tracking a project. Maintain the full task list in your prose replies ONLY — do NOT use any tools or files. Initial tasks: ${initProse}.`,
  "Update: mark item3 as done.",
  "Update: mark item7 as in-progress. Add task item51 (todo).",
  "How many tasks are done?",
  "Update: remove task item40.",
  "Update: add task item52 (todo).",
  "Report the FULL task list — every task with its status.",
];

const TURNS_C = [
  `You are tracking a project. Use the 'reason' tool to store the state. First create a state with a grammar: ":default ::= action => ::array / :start ::= program / program ::= cmd* / cmd ::= set_cmd | print_cmd / set_cmd ::= 'set' ident num action => store / print_cmd ::= 'print' ident action => print / ident ~ [A-Za-z0-9_]+ / num ~ [0-9]+ / :discard ~ whitespace / whitespace ~ [ ]+" (rules separated by newlines). Then execute an input stream recording the initial tasks (0=todo, 1=in-progress, 2=done): ${initDsl}.`,
  "Using the reason tool, mark item3 done (set item3 2).",
  "Using the reason tool, mark item7 in-progress (set item7 1). Add item51 (set item51 0).",
  "Using the reason tool, print item1 through item51 statuses, then report how many are done.",
  "Using the reason tool, note item40 is removed (ignore it from now on).",
  "Using the reason tool, add item52 (set item52 0).",
  "Report the FULL task list — every task with its status.",
];

function retainedIds(text: string): Set<number> {
  const found = new Set<number>();
  for (const m of text.matchAll(/item\s*(\d{1,2})/gi)) found.add(Number(m[1]));
  return found;
}

function runCondition(name: string, turns: string[]) {
  let sid: string | null = null;
  let total = 0;
  console.log(`\n== ${name} ==`);
  for (let i = 0; i < turns.length; i++) {
    const r = runTurn(turns[i], sid ?? undefined);
    if (r.sessionId) sid = r.sessionId;
    total += r.tokens;
    console.log(`  turn ${i + 1}: tok=${r.tokens} (cum ${total}) tools=${r.toolCalls}`);
    if (i === turns.length - 1) {
      const found = retainedIds(r.text);
      let hit = 0;
      for (const id of expected) if (found.has(id)) hit++;
      console.log(`  FINAL REPORT (${r.text.length} chars): ${r.text.slice(0, 200).replace(/\n/g, " ")}...`);
      console.log(`  RETENTION: ${hit}/${expected.size} items present`);
    }
  }
  console.log(`  TOTAL tokens=${total}`);
}

runCondition("A (prose)", TURNS_A);
runCondition("C (Aristotle)", TURNS_C);
