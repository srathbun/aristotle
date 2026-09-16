// Experiment 2 — compact persistent state (H2).
// Multi-turn state-tracking task. Compare A (prose/context) vs C (Aristotle executable state).
// DV: cumulative tokens; final-state accuracy. Ground truth computed by hand.
import { spawnSync } from "node:child_process";

const MODEL = process.env.E2_MODEL ?? "ollama/gpt-oss:20b";

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
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
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

// ---- the task: 7 turns of state updates + queries ----
const TURNS_A = [
  "You are tracking a sprint backlog. Maintain the task list in your prose replies ONLY — do NOT use any tools, do not write files, just keep the list in your text. Initial tasks and statuses: repo=done, parser=done, tests=in-progress, bug=todo, docs=todo, release=todo, benchmark=todo, review=in-progress.",
  "Update: mark 'tests' as done. Add a new task 'deploy' with status todo.",
  "Update: mark 'bug' as in-progress. Mark 'review' as done.",
  "How many tasks are currently done?",
  "Update: mark 'docs' as done. Remove task 'benchmark'.",
  "Update: add task 'rollback' with status todo. Mark 'release' as in-progress.",
  "Report the full task list, each task with its status.",
];

const TURNS_C = [
  "You are tracking a sprint backlog. Use the 'reason' tool to store the state as a machine. Step 1: create a state with a grammar for setting and printing task status (numeric code 0=todo, 1=in-progress, 2=done). Use rules like \"set <task> <num>\" with action => store, and \"print <task>\" with action => print. Step 2: execute an input stream recording the initial tasks: repo=2, parser=2, tests=1, bug=0, docs=0, release=0, benchmark=0, review=1.",
  "Using the reason tool, mark 'tests' done (set tests 2) and add task 'deploy' (set deploy 0).",
  "Using the reason tool, mark 'bug' in-progress (set bug 1) and 'review' done (set review 2).",
  "Using the reason tool, print all task statuses, then report how many tasks are done.",
  "Using the reason tool, mark 'docs' done (set docs 2). Note: task 'benchmark' is removed — ignore it from now on.",
  "Using the reason tool, add 'rollback' (set rollback 0) and mark 'release' in-progress (set release 1).",
  "Report the full task list, each task with its status.",
];

function runCondition(name: string, turns: string[]) {
  let sid: string | null = null;
  let total = 0;
  let toolCalls = 0;
  console.log(`\n== ${name} ==`);
  for (let i = 0; i < turns.length; i++) {
    const r = runTurn(turns[i], sid ?? undefined);
    if (r.sessionId) sid = r.sessionId;
    total += r.tokens;
    toolCalls += r.toolCalls;
    console.log(`  turn ${i + 1}: tok=${r.tokens} (cum ${total}) tools=${r.toolCalls}`);
    if (i === turns.length - 1) {
      console.log("  FINAL REPORT:\n" + r.text.split("\n").map((l) => "    " + l).join("\n"));
    }
  }
  console.log(`  TOTAL tokens=${total}, tool calls=${toolCalls}`);
}

runCondition("A (prose)", TURNS_A);
runCondition("C (Aristotle)", TURNS_C);
