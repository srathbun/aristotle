// Experiment 7 (rebuild) — 5x4 logic grid, thinking ON, tool-capabilities + puzzle only.
// Captures the reason-tool transcript + final answer, prints ground truth, flags confabulation.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const MODEL = process.env.E7_MODEL ?? "ollama/gpt-oss:20b";
const TRIALS = Number(process.env.E7_TRIALS ?? 3);

// Ground truth (verified by brute force): 3a unique; 3b two solutions.
const GT_3A = "Alice=cat/red/tea/chess | Bob=dog/blue/coffee/running | Carol=bird/green/juice/painting | Dave=fish/yellow/water/cooking | Erin=horse/white/soda/music";
const GT_3B = [
  "Alice=cat/red/tea/chess | Bob=dog/blue/coffee/running | Carol=bird/green/juice/painting | Dave=fish/yellow/water/cooking | Erin=horse/white/soda/music",
  "Alice=cat/red/tea/chess | Bob=dog/blue/soda/music | Carol=bird/green/juice/painting | Dave=fish/yellow/water/cooking | Erin=horse/white/coffee/running",
];

const CAPABILITIES = `An AI tool named "reason" is available to you. Its operations are:
- create: construct a grammar (a formal language definition).
- extend: replace the grammar with a new version (prior versions are retained).
- execute: run an input stream through the grammar; it returns valid, invalid, or ambiguous, with parser diagnostics, plus any text emitted by the grammar's rules.

Five people — Alice, Bob, Carol, Dave, Erin — each have exactly one pet (cat, dog, bird, fish, horse), one color (red, blue, green, yellow, white), one drink (tea, coffee, juice, water, soda), and one hobby (chess, running, painting, cooking, music). Each value in each category is used exactly once.

`;

// clue list; clue index 4 (Bob coffee) is the one dropped for 3b.
const CLUES_3A = [
  "1. Alice's pet is the cat.",
  "2. Carol's hobby is painting.",
  "3. Dave's color is yellow.",
  "4. Erin's pet is the horse.",
  "5. Bob's drink is coffee.",
  "6. Carol's color is green.",
  "7. The dog owner's color is blue.",
  "8. The fish owner's drink is water.",
  "9. The tea drinker's color is red.",
  "10. The bird owner's drink is juice.",
  "11. The cat owner's hobby is chess.",
  "12. The coffee drinker's hobby is running.",
  "13. The horse owner's color is white.",
  "14. The water drinker's hobby is cooking.",
  "15. The soda drinker's hobby is music.",
];

const PROMPT_A = CAPABILITIES + "Clues:\n" + CLUES_3A.join("\n") + "\n\nDetermine each person's pet, color, drink, and hobby.";
const PROMPT_B = CAPABILITIES + "Clues:\n" + CLUES_3A.filter((_, i) => i !== 4).map((s) => s.replace(/^\d+\./, (m) => (m))).join("\n") + "\n\nDetermine each person's pet, color, drink, and hobby.";

interface Call { op: string; grammar?: string; input?: string; text: string }

function runTrial(prompt: string, label: string, trial: number): { calls: Call[]; finalText: string } {
  const r = spawnSync("omp", ["-p", "--mode", "json", "--auto-approve", "--model", MODEL, prompt], {
    cwd: "F:/aristotle", encoding: "utf8", timeout: 900_000, maxBuffer: 200 * 1024 * 1024,
  });
  const raw = r.stdout ?? "";
  writeFileSync(`/tmp/e7b-${label}-${trial}.jsonl`, raw);
  const calls: Call[] = [];
  let finalText = "";
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let ev: unknown;
    try { ev = JSON.parse(line); } catch { continue; }
    if (typeof ev !== "object" || ev === null) continue;
    const e = ev as Record<string, unknown>;
    if (e.type === "message_end" && typeof e.message === "object" && e.message !== null) {
      const m = e.message as Record<string, unknown>;
      if (m.role === "assistant" && Array.isArray(m.content)) {
        let t = "";
        for (const item of m.content) {
          if (typeof item === "object" && item !== null) {
            const p = item as Record<string, unknown>;
            if (p.type === "text" && typeof p.text === "string") t += p.text;
          }
        }
        if (t.trim()) finalText = t;
      }
    }
    if (e.type === "tool_execution_end" && typeof e.result === "object" && e.result !== null) {
      const res = e.result as Record<string, unknown>;
      const details = (typeof res.details === "object" && res.details !== null) ? res.details as Record<string, unknown> : null;
      const xdev = details ? (typeof details.xdev === "object" && details.xdev !== null ? details.xdev as Record<string, unknown> : null) : null;
      if (xdev && xdev.tool === "reason") {
        const args = (typeof xdev.args === "object" && xdev.args !== null) ? xdev.args as Record<string, unknown> : {};
        const text = Array.isArray(res.content) ? res.content.map((c) => (typeof c === "object" && c !== null ? String((c as Record<string, unknown>).text ?? "") : "")).join("\n") : "";
        calls.push({ op: typeof args.operation === "string" ? args.operation : "?", grammar: typeof args.grammar === "string" ? args.grammar : undefined, input: typeof args.input === "string" ? args.input : undefined, text });
      }
    }
  }
  return { calls, finalText };
}

function statusOf(text: string): string {
  if (/AMBIGUOUS/.test(text)) return "AMBIGUOUS";
  if (/INVALID/.test(text)) return "INVALID";
  if (/VALID/.test(text)) return "VALID";
  if (/Created reasoning state/.test(text)) return "created";
  if (/Extended to grammar/.test(text)) return "extended";
  return "?";
}

function run(name: string, prompt: string, gt: string) {
  console.log(`\n############ ${name} ############`);
  console.log("GROUND TRUTH:\n  " + gt);
  for (let t = 0; t < TRIALS; t++) {
    const { calls, finalText } = runTrial(prompt, name.toLowerCase(), t);
    const grammarRev = calls.filter((c) => c.op === "create" || c.op === "extend").length;
    const claimed = /grammar|\breason\b|\bparse\b|\bexecute\b/i.test(finalText);
    const confab = claimed && calls.length === 0;
    console.log(`\n-- ${name} trial ${t + 1}: ${calls.length} reason calls (${grammarRev} grammar constructions/revisions) --`);
    for (const c of calls) {
      const d = (c.op === "create" || c.op === "extend") ? `grammar${c.grammar ? ` (${c.grammar.length} ch)` : ""}` : `input "${(c.input ?? "").slice(0, 50)}"`;
      console.log(`    ${c.op} ${d} -> ${statusOf(c.text)}${c.text && c.text.length < 80 ? " | " + c.text.replace(/\n/g, " ") : ""}`);
    }
    console.log(`  CLAIMED-tool-use-in-text=${claimed} ACTUAL-calls=${calls.length}${confab ? "  ⚠ CONFABULATED" : ""}`);
    console.log("  FINAL ANSWER:\n" + finalText.split("\n").map((l) => "    " + l).join("\n").slice(0, 1200));
  }
}

console.log("=== Experiment 7 rebuild (thinking ON, 5x4 puzzle) === model: " + MODEL);
run("3a", PROMPT_A, GT_3A);
run("3b", PROMPT_B, GT_3B.join("\n  "));