// Experiment 1 — constraint enforcement (H1), provided-grammar variant.
// Compare: A = prompt-only generation vs C = provided grammar + execute/INVALID/fix loop.
// DV: topologically-correct plan fraction; also tokens, tool calls, and (C) INVALID-noticed count.
import { spawnSync } from "node:child_process";

const MODEL = process.env.E1_MODEL ?? "ollama/gpt-oss:20b";
const TRIALS = Number(process.env.E1_TRIALS ?? 2);

type Deps = Record<string, string[]>;

// ---- DAGs (component -> dependencies). Reverse deps make alphabetical order WRONG. ----
const DAGS: Deps[] = [
  { A: ["B"], B: [], C: ["A"], D: ["C"], E: ["B", "C"], F: ["D", "E"] }, // 2 valid orders
  { A: ["B"], B: [], C: ["B"], D: ["A"], E: ["A", "C"], F: ["D", "E"] }, // 4 valid orders
];

// ---- DAG -> encoding grammar (enumerate valid topological orders) ----
function enumerateTopoOrders(deps: Deps): string[][] {
  const nodes = Object.keys(deps);
  const results: string[][] = [];
  const placed = new Set<string>();
  (function recurse(order: string[]) {
    if (order.length === nodes.length) { results.push([...order]); return; }
    for (const n of nodes) {
      if (placed.has(n)) continue;
      if (deps[n].every((d) => placed.has(d))) {
        placed.add(n); order.push(n); recurse(order); order.pop(); placed.delete(n);
      }
    }
  })([]);
  return results;
}

function generateGrammar(deps: Deps): { grammar: string; orderCount: number } {
  const orders = enumerateTopoOrders(deps);
  const lines = [":default ::= action => ::array", ":start ::= plan"];
  const names = orders.map((_, i) => `o${i + 1}`);
  lines.push(`plan ::= ${names.join(" | ")}`);
  orders.forEach((order, i) => lines.push(`${names[i]} ::= ${order.map((n) => `s_${n}`).join(" ")}`));
  for (const n of Object.keys(deps)) lines.push(`s_${n} ::= 'step' '${n}' lword lword`);
  lines.push("lword ~ [a-z.]+", ":discard ~ whitespace", "whitespace ~ [ ]+");
  return { grammar: lines.join("\n"), orderCount: orders.length };
}

// ---- omp driver ----
function runOmp(prompt: string): { finalText: string; tokens: number; toolCalls: number } {
  const r = spawnSync("omp", ["-p", "--mode", "json", "--auto-approve", "--thinking", "off", "--model", MODEL, prompt], {
    cwd: "F:/aristotle", encoding: "utf8", timeout: 600_000, maxBuffer: 200 * 1024 * 1024,
  });
  let finalText = "", tokens = 0, toolCalls = 0;
  for (const line of (r.stdout ?? "").split("\n")) {
    if (!line.trim()) continue;
    let ev: any;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === "message_end" && ev.message?.role === "assistant") {
      const txt = (ev.message.content ?? []).filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n");
      if (txt.trim()) finalText = txt;
      tokens += (ev.message.usage?.input ?? 0) + (ev.message.usage?.output ?? 0);
    }
    if (ev.type === "tool_execution_end") toolCalls++;
  }
  return { finalText, tokens, toolCalls };
}

// ---- validation ----
function extractIds(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/step\s+([A-Z])/gi)) out.push(m[1].toUpperCase());
  return out;
}

function validateOrder(ids: string[], deps: Deps): { ok: boolean; reason: string } {
  const nodes = Object.keys(deps);
  if (ids.length !== nodes.length) return { ok: false, reason: `wrong count ${ids.length}/${nodes.length}` };
  if (new Set(ids).size !== ids.length) return { ok: false, reason: "duplicate" };
  const pos = new Map(ids.map((id, i) => [id, i]));
  for (const id of nodes) if (!pos.has(id)) return { ok: false, reason: `missing ${id}` };
  for (const [id, dlist] of Object.entries(deps)) {
    for (const d of dlist) {
      if ((pos.get(d) ?? 0) > (pos.get(id) ?? 0)) return { ok: false, reason: `${id} before dep ${d}` };
    }
  }
  return { ok: true, reason: "ok" };
}

// ---- prompts ----
function depsText(deps: Deps): string {
  return Object.entries(deps).map(([id, d]) => `- ${id} depends on ${d.length ? d.join(", ") : "nothing"}`).join("\n");
}

function promptA(deps: Deps): string {
  return `You are a build engineer. A component that depends on another must be built AFTER it. Dependencies:\n${depsText(deps)}\n\nProduce a build plan: the ${Object.keys(deps).length} components in a valid build order, one step per line:\nstep <LETTER> <command> <artifact>\n\nUse a single lowercase word for command and a single lowercase word for artifact. Output ONLY the step lines, nothing else.`;
}

function promptC(deps: Deps, grammar: string): string {
  return `You are a build engineer. A component that depends on another must be built AFTER it. Dependencies:\n${depsText(deps)}\n\nProduce a build plan (dependencies before dependents), one step per line:\nstep <LETTER> <command> <artifact>\n\nThen VALIDATE your plan with the "reason" tool:\n1. reason: operation "create", grammar exactly:\n${grammar}\n2. reason: operation "execute", state_id = the id the create returned, input = your plan as ONE space-separated line.\n3. If execute returns INVALID, read the "Expected:" lines to see which component must come next, fix your plan's ORDER, and execute again until VALID.\n\nReply with your FINAL plan (the step lines only, nothing else).`;
}

// ---- main ----
let aOk = 0, cOk = 0, aRuns = 0, cRuns = 0;
for (let di = 0; di < DAGS.length; di++) {
  const deps = DAGS[di];
  const { grammar, orderCount } = generateGrammar(deps);
  console.log(`== DAG ${di + 1} (${orderCount} valid orders) ==`);
  for (let t = 0; t < TRIALS; t++) {
    const a = runOmp(promptA(deps));
    const av = validateOrder(extractIds(a.finalText), deps);
    aRuns++; if (av.ok) aOk++;
    const c = runOmp(promptC(deps, grammar));
    const cv = validateOrder(extractIds(c.finalText), deps);
    cRuns++; if (cv.ok) cOk++;
    console.log(`  trial ${t + 1}: A=${av.ok} C=${cv.ok} | A tok=${a.tokens} C tok=${c.tokens} C toolcalls=${c.toolCalls}`);
    if (!av.ok) console.log(`    A ids: ${extractIds(a.finalText).join(" ")} (${av.reason})`);
    if (!cv.ok) console.log(`    C ids: ${extractIds(c.finalText).join(" ")} (${cv.reason})`);
  }
}
console.log(`\nRESULT: A ${aOk}/${aRuns} correct, C ${cOk}/${cRuns} correct`);