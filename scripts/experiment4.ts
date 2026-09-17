// Experiment 4 — combinatorial search externalization (H4). Small TSP (6 cities).
// A = in-context reasoning; C = construct a cost machine (reason tool) and search.
// DV: tour cost vs optimal (19), plus whether C actually externalizes cost computation.
import { spawnSync } from "node:child_process";

const MODEL = process.env.E4_MODEL ?? "ollama/gpt-oss:20b";
const EDGES_TEXT = "AB=2, AC=7, AD=20, AE=12, AF=8, AG=3, AH=20, AI=9, AJ=6, BC=6, BD=15, BE=18, BF=7, BG=13, BH=8, BI=19, BJ=7, CD=20, CE=4, CF=7, CG=3, CH=7, CI=4, CJ=7, DE=18, DF=18, DG=9, DH=15, DI=14, DJ=1, EF=18, EG=16, EH=15, EI=2, EJ=11, FG=17, FH=3, FI=1, FJ=10, GH=20, GI=8, GJ=11, HI=8, HJ=6, IJ=10";
const OPTIMAL = 37;

function runOmp(prompt: string): { text: string; tokens: number; toolCalls: number } {
  const r = spawnSync("omp", ["-p", "--mode", "json", "--auto-approve", "--thinking", "off", "--model", MODEL, prompt], {
    cwd: "F:/aristotle", encoding: "utf8", timeout: 600_000, maxBuffer: 200 * 1024 * 1024,
  });
  let text = "", tokens = 0, toolCalls = 0;
  for (const line of (r.stdout ?? "").split("\n")) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { continue; }
    if (typeof parsed !== "object" || parsed === null) continue;
    const ev = parsed as Record<string, unknown>;
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
  return { text, tokens, toolCalls };
}

const promptA = `Find the shortest Hamiltonian cycle of these 10 cities (visit each of A-J exactly once, then return to the start). Edge distances: ${EDGES_TEXT}. Report the best tour as a city sequence and its total cost.`;

const promptC = `Find the shortest Hamiltonian cycle of these 10 cities (visit each of A-J exactly once, then return to the start). Edge distances: ${EDGES_TEXT}.\n\nYou MUST use the "reason" tool to compute tour costs: create a state with a grammar that sums numbers and reports a total (rules: "add total <n>" with action => add, and "print total" with action => print). For each candidate tour, compute its cost by executing the sum of its edge distances through the machine, then read the total. Try several candidate tours, keep the shortest, and report the best tour and its cost.`;

for (const [name, prompt] of [["A (in-context)", promptA], ["C (cost machine)", promptC]] as const) {
  const r = runOmp(prompt);
  console.log(`\n== ${name} ==`);
  console.log(`  tokens=${r.tokens}, toolCalls=${r.toolCalls}`);
  console.log("  FINAL:\n" + r.text.split("\n").map((l) => "    " + l).join("\n"));
}
console.log(`\n(optimal = ${OPTIMAL}, ABCEIFHJDG)`);
