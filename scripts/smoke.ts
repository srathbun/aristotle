// Headless omp smoke test: drives the `reason` tool end-to-end and asserts coarse statuses.
// Scenario 1 basic parse, 2 ambiguity, 3 dynamic grammar, 4 persistence (via `-c` continuation).
// Assertions are only on structured reason-tool result text; prose is never asserted.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODEL = process.env.SMOKE_MODEL ?? "ollama/gpt-oss:20b";
const RUN = process.env.SMOKE_RUN ?? ""; // optional: "1"|"2"|"3"|"4" to run one scenario

// Backslash-free grammars so a weak local model can reproduce them faithfully in JSON
// args (the deterministic worker/state tests already cover the full .slif grammars).
const smokeDependency = [
  ":default ::= action => ::array",
  ":start ::= statements",
  "statements ::= statement+",
  "statement ::= fact | dependency",
  "fact ::= 'fact(' symbol ')'",
  "dependency ::= 'depends(' symbol ',' symbol ')'",
  "symbol ~ [A-Za-z_]+",
  ":discard ~ whitespace",
  "whitespace ~ [ ]+",
].join("\n");

const smokeWidened = [
  ":default ::= action => ::array",
  ":start ::= statements",
  "statements ::= statement+",
  "statement ::= fact | dependency | cause",
  "fact ::= 'fact(' symbol ')'",
  "dependency ::= 'depends(' symbol ',' symbol ')'",
  "cause ::= 'causes(' symbol ',' symbol ')'",
  "symbol ~ [A-Za-z_]+",
  ":discard ~ whitespace",
  "whitespace ~ [ ]+",
].join("\n");

const smokeAmbiguity = [
  ":default ::= action => ::array",
  ":start ::= expr",
  "expr ::= term                 action => ::first",
  "expr ::= expr '+' expr",
  "expr ::= expr '*' expr",
  "term ~ [0-9]+",
  ":discard ~ whitespace",
  "whitespace ~ [ ]+",
].join("\n");

const smokeEmit = [
  ":default ::= action => ::array",
  ":start ::= program",
  "program ::= observation*",
  "observation ::= 'conflict' name 'and' name   action => emit",
  "name ~ [A-Za-z_]+",
  ":discard ~ whitespace",
  "whitespace ~ [ ]+",
].join("\n");

const smokeAmbiguousExec = [
  ":default ::= action => ::array",
  ":start ::= program",
  "program ::= expr   action => emit",
  "expr ::= term                 action => ::first",
  "expr ::= expr '+' expr",
  "expr ::= expr '*' expr",
  "term ~ [0-9]+",
  ":discard ~ whitespace",
  "whitespace ~ [ ]+",
].join("\n");

interface ReasonResult {
  text: string;
  inner: Record<string, unknown>;
}

interface Check {
  pass: boolean;
  detail: string;
}

function parseLine(line: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(line);
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function runOmp(prompt: string, extraArgs: string[] = []): { stdout: string; stderr: string; status: number | null } {
  const args = [
    "-p", "--mode", "json", "--auto-approve", "--thinking", "off",
    "--model", MODEL, ...extraArgs, prompt,
  ];
  const r = spawnSync("omp", args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 600_000,
    maxBuffer: 200 * 1024 * 1024,
  });
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", status: r.status };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

function textOf(r: Record<string, unknown>): string {
  const content = r.content;
  if (Array.isArray(content) && typeof content[0] === "object" && content[0] !== null) {
    return String((content[0] as Record<string, unknown>).text ?? "");
  }
  return "";
}

function reasonResults(stdout: string): ReasonResult[] {
  const out: ReasonResult[] = [];
  for (const line of stdout.split("\n")) {
    const ev = parseLine(line);
    if (!ev || ev.type !== "tool_execution_end") continue;
    const result = asRecord(ev.result);
    if (!result) continue;
    const details = asRecord(result.details);
    // Native shape: toolName "reason", details are the extension's own details.
    if (ev.toolName === "reason") {
      out.push({ text: textOf(result), inner: details ?? {} });
      continue;
    }
    // Wrapped shape: toolName "write" writing to xd://reason.
    const xdev = details ? asRecord(details.xdev) : null;
    if (xdev && xdev.tool === "reason") {
      out.push({ text: textOf(result), inner: asRecord(xdev.inner) ?? {} });
    }
  }
  return out;
}

function sessionIdOf(stdout: string): string | null {
  for (const line of stdout.split("\n")) {
    const ev = parseLine(line);
    if (ev && ev.type === "session" && typeof ev.id === "string") return ev.id;
  }
  return null;
}

function reasonsText(rs: ReasonResult[]): string {
  return rs.map((r) => r.text.slice(0, 60)).join(" | ");
}

function scenario(name: string, prompt: string, assert: (rs: ReasonResult[]) => Check, extraArgs: string[] = []): { name: string; run: () => Check } {
  return {
    name,
    run: () => {
      let lastFail: Check = { pass: false, detail: "not run" };
      for (let attempt = 1; attempt <= 2; attempt++) {
        const { stdout, stderr, status } = runOmp(prompt, extraArgs);
        writeFileSync(`/tmp/smoke-${name.replace(/ /g, "-")}.jsonl`, stdout);
        if (status !== 0) {
          lastFail = { pass: false, detail: `omp exited ${status}; stderr: ${stderr.slice(0, 300)}` };
          continue;
        }
        const rs = reasonResults(stdout);
        if (rs.length === 0) {
          lastFail = { pass: false, detail: "no reason tool results in output" };
          continue;
        }
        const c = assert(rs);
        if (c.pass) return c;
        lastFail = c;
      }
      return { pass: false, detail: `${lastFail.detail} (after 2 attempts)` };
    },
  };
}

const s1Prompt = `You MUST call the "reason" tool exactly four times as listed below. Do not reply with text only — actually make every tool call, in order. After the first call the state_id is "r1"; use state_id "r1" for all remaining calls.

1. reason: operation "create", grammar exactly:
${smokeDependency}

2. reason: operation "add", state_id "r1", fragment "fact(A)"
3. reason: operation "add", state_id "r1", fragment "depends(A,B)"
4. reason: operation "parse", state_id "r1"

Then reply with only the final parse status word.`;

const s2Prompt = `You MUST call the "reason" tool exactly three times as listed below. Do not reply with text only — actually make every tool call, in order. After the first call the state_id is "r1"; use state_id "r1" for all remaining calls.

1. reason: operation "create", grammar exactly:
${smokeAmbiguity}

2. reason: operation "add", state_id "r1", fragment "1+2*3"
3. reason: operation "parse", state_id "r1"

Then reply with only the final parse status word.`;

const s3Prompt = `You MUST call the "reason" tool exactly five times as listed below. Do not reply with text only — actually make every tool call, in order. After the first call the state_id is "r1"; use state_id "r1" for all remaining calls.

1. reason: operation "create", grammar exactly:
${smokeDependency}

2. reason: operation "add", state_id "r1", fragment "causes(A,B)"
3. reason: operation "parse", state_id "r1"
4. reason: operation "extend", state_id "r1", grammar exactly:
${smokeWidened}

5. reason: operation "parse", state_id "r1"

Then reply with only the final parse status word.`;

const s5Prompt = `You MUST call the "reason" tool exactly twice as listed below. Do not reply with text only — actually make every tool call, in order. After the first call the state_id is "r1".

1. reason: operation "create", grammar exactly:
${smokeEmit}

2. reason: operation "execute", state_id "r1", input "conflict alice and bob"

Then reply with only the emitted text.`;

const s6Prompt = `You MUST call the "reason" tool exactly three times as listed below. Do not reply with text only — actually make every tool call, in order. After the first call the state_id is "r1".

1. reason: operation "create", grammar exactly:
${smokeAmbiguousExec}

2. reason: operation "execute", state_id "r1", input "1+2*3"
3. reason: operation "commit", state_id "r1", input "1+2*3", index 1

Then reply with only the chosen interpretation.`;

const s7Prompt = `You MUST call the "reason" tool exactly four times as listed below. Do not reply with text only — actually make every tool call, in order. After the first call the state_id is "r1".

1. reason: operation "create", grammar exactly:
${smokeDependency}

2. reason: operation "execute", state_id "r1", input "causes(A,B)"
3. reason: operation "extend", state_id "r1", grammar exactly:
${smokeWidened}

4. reason: operation "execute", state_id "r1", input "causes(A,B)"

Then reply with only the final execute status word.`;

const scenarios = [
  scenario("S1 basic parse", s1Prompt, (rs) => {
    const created = rs.some((r) => r.text.includes("Created reasoning state"));
    const valid = rs.some((r) => r.text.includes("Parse VALID"));
    if (created && valid) return { pass: true, detail: `${rs.length} reason calls; VALID seen` };
    return { pass: false, detail: `created=${created} valid=${valid}; ${rs.map((r) => r.text.slice(0, 50)).join(" | ")}` };
  }),
  scenario("S2 ambiguity", s2Prompt, (rs) => {
    const amb = rs.find((r) => r.text.includes("AMBIGUOUS"));
    if (amb && /2 interpretations/.test(amb.text)) return { pass: true, detail: amb.text };
    return { pass: false, detail: rs.map((r) => r.text.slice(0, 80)).join(" | ") };
  }),
  scenario("S3 dynamic grammar", s3Prompt, (rs) => {
    const invalid = rs.some((r) => r.text.includes("Parse INVALID"));
    const extended = rs.some((r) => r.text.includes("Extended to grammar v2"));
    const valid = rs.some((r) => r.text.includes("Parse VALID"));
    if (invalid && extended && valid) return { pass: true, detail: `INVALID -> extend v2 -> VALID (${rs.length} calls)` };
    return { pass: false, detail: `invalid=${invalid} extended=${extended} valid=${valid}; ${rs.map((r) => r.text.slice(0, 60)).join(" | ")}` };
  }),
  scenario("S5 emit", s5Prompt, (rs) => {
    const exec = rs.find((r) => Array.isArray(r.inner.emitted) && r.inner.emitted.length > 0);
    if (exec) return { pass: true, detail: `emitted: ${JSON.stringify(exec.inner.emitted)}` };
    return { pass: false, detail: `no emitted context; ${reasonsText(rs)}` };
  }),
  scenario("S6 commit", s6Prompt, (rs) => {
    const amb = rs.find((r) => r.text.includes("AMBIGUOUS"));
    const commit = rs.find((r) => r.text.includes("Committed to interpretation"));
    if (amb && commit) return { pass: true, detail: `ambiguous -> commit (${rs.length} calls)` };
    return { pass: false, detail: `amb=${!!amb} commit=${!!commit}; ${reasonsText(rs)}` };
  }),
  scenario("S7 repair loop", s7Prompt, (rs) => {
    const invalid = rs.some((r) => r.text.includes("Execute INVALID"));
    const extended = rs.some((r) => r.text.includes("Extended to grammar v2"));
    const valid = rs.some((r) => r.text.includes("Execute VALID"));
    if (invalid && extended && valid) return { pass: true, detail: `execute INVALID -> extend v2 -> execute VALID (${rs.length} calls)` };
    return { pass: false, detail: `invalid=${invalid} extended=${extended} valid=${valid}; ${reasonsText(rs)}` };
  }),
];

function persistence(): Check {
  let lastFail: Check = { pass: false, detail: "not run" };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const c = persistenceOnce();
    if (c.pass) return c;
    lastFail = c;
  }
  return { pass: false, detail: `${lastFail.detail} (after 2 attempts)` };
}

function persistenceOnce(): Check {
  const run1 = runOmp(s1Prompt);
  if (run1.status !== 0) return { pass: false, detail: `run1 exited ${run1.status}` };
  writeFileSync("/tmp/smoke-run1.jsonl", run1.stdout);
  const sid = sessionIdOf(run1.stdout);
  if (!sid) return { pass: false, detail: `no session id in run1 output (first line: ${run1.stdout.split("\n")[0]?.slice(0, 120)})` };
  const inspectPrompt =
    'The reasoning state "r1" already exists from the previous session. ' +
    'Use the "reason" tool exactly once: operation "inspect", state_id "r1". ' +
    "Then report how many fragments the state has. Do not create or add anything.";
  const run2 = runOmp(inspectPrompt, ["--resume", sid]);
  if (run2.status !== 0) return { pass: false, detail: `run2 exited ${run2.status}` };
  const rs = reasonResults(run2.stdout);
  const insp = rs.find((r) => Array.isArray(r.inner.fragments));
  const count = insp && Array.isArray(insp.inner.fragments) ? insp.inner.fragments.length : -1;
  if (count === 2) return { pass: true, detail: `state reconstructed with ${count} fragments across restart` };
  return { pass: false, detail: `fragment_count=${count}; ${reasonsText(rs)}` };
}

const all = [...scenarios, { name: "S4 persistence", run: persistence }];
const selected = RUN ? all.filter((s) => s.name.startsWith(`S${RUN}`)) : all;

console.log(`Marpa reasoning smoke test — model: ${MODEL}`);
let failed = 0;
for (const s of selected) {
  process.stdout.write(`${s.name}: running... `);
  const c = s.run();
  if (c.pass) {
    console.log("PASS");
    console.log(`  ${c.detail}`);
  } else {
    failed++;
    console.log("FAIL");
    console.log(`  ${c.detail}`);
  }
}

if (failed > 0) {
  console.error(`${failed} scenario(s) failed`);
  process.exit(1);
}
console.log("all scenarios passed");
