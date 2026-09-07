import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePerlPath, resolveWorkerScript } from "../src/worker-paths.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dependencyGrammar = readFileSync(join(repoRoot, "grammars", "dependency.slif"), "utf8");
const ambiguityGrammar = readFileSync(join(repoRoot, "grammars", "ambiguity.slif"), "utf8");
const commandsGrammar = readFileSync(join(repoRoot, "grammars", "commands.slif"), "utf8");
const observationGrammar = readFileSync(join(repoRoot, "grammars", "observation.slif"), "utf8");
const ambiguousExecGrammar = readFileSync(join(repoRoot, "grammars", "ambiguous-exec.slif"), "utf8");

// Widened dependency grammar (adds `causes(A,B)`) used for the v1->v2 reparse test.
const widenedGrammar = [
  ":default ::= action => ::array",
  ":start ::= statements",
  "statements ::= statement+",
  "statement ::= fact | dependency | missing | cause",
  "fact ::= 'fact' '(' symbol ')'",
  "dependency ::= 'depends' '(' symbol ',' symbol ')'",
  "missing ::= 'missing' '(' symbol ')'",
  "cause ::= 'causes' '(' symbol ',' symbol ')'",
  "symbol ~ [A-Za-z_]+",
  ":discard ~ whitespace",
  "whitespace ~ [\\s]+",
].join("\n");

class Worker {
  private proc: ChildProcessWithoutNullStreams;
  private buffer = "";
  private queue: unknown[] = [];
  private waiters: Array<() => void> = [];
  private nextId = 1;

  constructor(perl: string, script: string) {
    this.proc = spawn(perl, [script], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, LC_ALL: "C", LANG: "C" },
    });
    this.proc.stdout.on("data", (d: Buffer) => this.onData(d));
  }

  private onData(d: Buffer) {
    this.buffer += d.toString("utf8");
    let i: number;
    while ((i = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, i).trim();
      this.buffer = this.buffer.slice(i + 1);
      if (!line) continue;
      let resp: unknown;
      try {
        resp = JSON.parse(line);
      } catch {
        continue;
      }
      this.queue.push(resp);
      const w = this.waiters.shift();
      if (w) w();
    }
  }

  nextResponse(): Promise<any> {
    if (this.queue.length) return Promise.resolve(this.queue.shift());
    return new Promise((resolve) => {
      this.waiters.push(() => resolve(this.queue.shift()));
    });
  }

  sendRaw(line: string) {
    this.proc.stdin.write(line + "\n");
  }

  async request(req: Record<string, unknown>): Promise<any> {
    const id = this.nextId++;
    this.proc.stdin.write(JSON.stringify({ ...req, id }) + "\n");
    for (;;) {
      const resp = await this.nextResponse();
      if (resp.id === id) return resp;
    }
  }

  close() {
    this.proc.stdin.end();
  }
}

let worker: Worker;

before(() => {
  worker = new Worker(resolvePerlPath(), resolveWorkerScript());
});

after(() => {
  worker.close();
});

test("create returns state_id and grammar_version 1", async () => {
  const r = await worker.request({ op: "create", grammar: dependencyGrammar });
  assert.equal(r.ok, true);
  assert.equal(r.state_id, "r1");
  assert.equal(r.grammar_version, 1);
});

test("add fragments then parse yields VALID", async () => {
  await worker.request({ op: "create", state_id: "dep", grammar: dependencyGrammar });
  await worker.request({ op: "add", state_id: "dep", fragment: "fact(A)" });
  await worker.request({ op: "add", state_id: "dep", fragment: "depends(A,B)" });
  await worker.request({ op: "add", state_id: "dep", fragment: "missing(C)" });
  const r = await worker.request({ op: "parse", state_id: "dep" });
  assert.equal(r.ok, true);
  assert.equal(r.status, "VALID");
  assert.equal(r.value_count, 1);
  assert.equal(r.values.length, 1);
  assert.ok(r.values[0].length > 0);
});

test("ambiguous grammar yields AMBIGUOUS with >=2 interpretations", async () => {
  await worker.request({ op: "create", state_id: "amb", grammar: ambiguityGrammar });
  await worker.request({ op: "add", state_id: "amb", fragment: "1+2*3" });
  const r = await worker.request({ op: "parse", state_id: "amb" });
  assert.equal(r.ok, true);
  assert.equal(r.status, "AMBIGUOUS");
  assert.ok(r.value_count >= 2);
  assert.ok(r.values.length >= 2);
  assert.ok(r.values.every((v: string) => v.length > 0));
});

test("unrecognized fragment yields INVALID with non-empty error", async () => {
  await worker.request({ op: "create", state_id: "bad", grammar: dependencyGrammar });
  await worker.request({ op: "add", state_id: "bad", fragment: "causes(A,B)" });
  const r = await worker.request({ op: "parse", state_id: "bad" });
  assert.equal(r.ok, true);
  assert.equal(r.status, "INVALID");
  assert.ok(typeof r.error === "string" && r.error.length > 0);
});

test("extend with bad grammar returns GRAMMAR_ERROR and leaves state intact", async () => {
  await worker.request({ op: "create", state_id: "ext1", grammar: dependencyGrammar });
  await worker.request({ op: "add", state_id: "ext1", fragment: "fact(A)" });
  const bad = await worker.request({ op: "extend", state_id: "ext1", grammar: ":start ::= (" });
  assert.equal(bad.ok, false);
  assert.equal(bad.error.code, "GRAMMAR_ERROR");
  const insp = await worker.request({ op: "inspect", state_id: "ext1" });
  assert.equal(insp.grammar_version, 1);
  assert.equal(insp.fragment_count, 1);
});

test("extend with widened grammar installs v2 and reparses fragments", async () => {
  await worker.request({ op: "create", state_id: "ext2", grammar: dependencyGrammar });
  await worker.request({ op: "add", state_id: "ext2", fragment: "causes(A,B)" });
  const before = await worker.request({ op: "parse", state_id: "ext2" });
  assert.equal(before.status, "INVALID");
  const ext = await worker.request({ op: "extend", state_id: "ext2", grammar: widenedGrammar });
  assert.equal(ext.ok, true);
  assert.equal(ext.grammar_version, 2);
  assert.equal(ext.status, "VALID");
  const insp = await worker.request({ op: "inspect", state_id: "ext2" });
  assert.equal(insp.grammar_version, 2);
});

test("malformed JSON line returns PARSE_ERROR and worker stays alive", async () => {
  worker.sendRaw("}{ this is not json");
  const err = await worker.nextResponse();
  assert.equal(err.id, null);
  assert.equal(err.ok, false);
  assert.equal(err.error.code, "PARSE_ERROR");
  // worker still responsive
  const r = await worker.request({ op: "inspect", state_id: "dep" });
  assert.equal(r.ok, true);
});

test("unknown state_id returns UNKNOWN_STATE", async () => {
  const r = await worker.request({ op: "parse", state_id: "no-such-state" });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "UNKNOWN_STATE");
});

test("worker stays alive across 20 sequential requests", async () => {
  await worker.request({ op: "create", state_id: "bulk", grammar: dependencyGrammar });
  const reqs = [];
  for (let i = 0; i < 20; i++) {
    reqs.push(worker.request({ op: "add", state_id: "bulk", fragment: "fact(A)" }));
  }
  const results = await Promise.all(reqs);
  for (const r of results) assert.equal(r.ok, true);
  const parse = await worker.request({ op: "parse", state_id: "bulk" });
  assert.equal(parse.status, "VALID");
  assert.equal(parse.fragment_count, 20);
});

test("execute: a constructed grammar processes an independent stream with semantic effects", async () => {
  await worker.request({ op: "create", state_id: "exec", grammar: commandsGrammar });
  // The input stream is supplied AFTER construction, and is not part of the grammar.
  const r = await worker.request({ op: "execute", state_id: "exec", input: "set x 10\nadd x 5\nprint x" });
  assert.equal(r.ok, true);
  assert.equal(r.status, "VALID");
  assert.deepEqual(r.output, ["x=15"]);
  assert.deepEqual(r.vars, { x: 15 });
});

test("execute: one installed grammar serves multiple independent streams", async () => {
  await worker.request({ op: "create", state_id: "exec2", grammar: commandsGrammar });
  const a = await worker.request({ op: "execute", state_id: "exec2", input: "set y 3\nprint y" });
  assert.deepEqual(a.vars, { y: 3 });
  assert.deepEqual(a.output, ["y=3"]);
  const b = await worker.request({ op: "execute", state_id: "exec2", input: "set z 7\nadd z 2\nprint z" });
  assert.deepEqual(b.vars, { z: 9 });
  assert.deepEqual(b.output, ["z=9"]);
});

test("execute: invalid input yields INVALID with an error", async () => {
  const r = await worker.request({ op: "execute", state_id: "exec", input: "set x abc" });
  assert.equal(r.ok, true);
  assert.equal(r.status, "INVALID");
  assert.ok(typeof r.error === "string" && r.error.length > 0);
});

test("execute: grammar without actions yields VALID with empty effects", async () => {
  await worker.request({ op: "create", state_id: "noact", grammar: dependencyGrammar });
  const r = await worker.request({ op: "execute", state_id: "noact", input: "fact(A) depends(A,B)" });
  assert.equal(r.ok, true);
  assert.equal(r.status, "VALID");
  assert.deepEqual(r.output, []);
  assert.deepEqual(r.emitted, []);
  assert.deepEqual(r.vars, {});
});

test("emit: a grammar rule emits machine-generated text from an independent stream", async () => {
  await worker.request({ op: "create", state_id: "emit", grammar: observationGrammar });
  const r = await worker.request({ op: "execute", state_id: "emit", input: "conflict alice and bob" });
  assert.equal(r.ok, true);
  assert.equal(r.status, "VALID");
  assert.deepEqual(r.emitted, ["conflict alice and bob"]);
  assert.deepEqual(r.output, []);
});

test("emit: interpolates parsed values and preserves multiple emissions in order", async () => {
  const r = await worker.request({
    op: "execute",
    state_id: "emit",
    input: "conflict alice and bob conflict bob and carol",
  });
  assert.equal(r.status, "VALID");
  assert.deepEqual(r.emitted, ["conflict alice and bob", "conflict bob and carol"]);
});

test("emit: a fixed literal rule emits a fixed message", async () => {
  const grammar = [
    ":default ::= action => ::array",
    ":start ::= program",
    "program ::= warn*",
    "warn ::= 'Potential conflict detected'   action => emit",
    ":discard ~ whitespace",
    "whitespace ~ [\\s]+",
  ].join("\n");
  await worker.request({ op: "create", state_id: "fixed", grammar });
  const r = await worker.request({ op: "execute", state_id: "fixed", input: "Potential conflict detected" });
  assert.equal(r.status, "VALID");
  assert.deepEqual(r.emitted, ["Potential conflict detected"]);
});

test("execute: ambiguous input reports AMBIGUOUS and runs no actions", async () => {
  await worker.request({ op: "create", state_id: "ambx", grammar: ambiguousExecGrammar });
  const r = await worker.request({ op: "execute", state_id: "ambx", input: "1+2*3" });
  assert.equal(r.ok, true);
  assert.equal(r.status, "AMBIGUOUS");
  assert.ok(r.value_count >= 2);
  assert.ok(r.values.length >= 2);
  assert.ok(r.values.every((v: string) => v.length > 0));
  // Side effects must not have run on the ambiguous machine.
  assert.deepEqual(r.output, []);
  assert.deepEqual(r.emitted, []);
  assert.deepEqual(r.vars, {});
});

test("execute: unambiguous input under the same grammar runs actions", async () => {
  await worker.request({ op: "create", state_id: "ambu", grammar: ambiguousExecGrammar });
  const r = await worker.request({ op: "execute", state_id: "ambu", input: "42" });
  assert.equal(r.ok, true);
  assert.equal(r.status, "VALID");
  assert.equal(r.value_count, 1);
  assert.deepEqual(r.emitted, ["42"]);
  assert.deepEqual(r.output, []);
  assert.deepEqual(r.vars, {});
});

test("commit: selects a specific interpretation of an ambiguous input", async () => {
  await worker.request({ op: "create", state_id: "commit", grammar: ambiguousExecGrammar });
  const ex = await worker.request({ op: "execute", state_id: "commit", input: "1+2*3" });
  assert.equal(ex.status, "AMBIGUOUS");
  assert.equal(ex.value_count, 2);
  const c1 = await worker.request({ op: "commit", state_id: "commit", input: "1+2*3", index: 1 });
  assert.equal(c1.ok, true);
  assert.equal(c1.status, "VALID");
  assert.equal(c1.index, 1);
  assert.equal(c1.value, ex.values[0]);
  const c2 = await worker.request({ op: "commit", state_id: "commit", input: "1+2*3", index: 2 });
  assert.equal(c2.ok, true);
  assert.equal(c2.status, "VALID");
  assert.equal(c2.index, 2);
  assert.equal(c2.value, ex.values[1]);
  assert.notEqual(c1.value, c2.value);
});

test("commit: is deterministic across repeated calls", async () => {
  const a = await worker.request({ op: "commit", state_id: "commit", input: "1+2*3", index: 2 });
  const b = await worker.request({ op: "commit", state_id: "commit", input: "1+2*3", index: 2 });
  assert.equal(a.value, b.value);
});

test("commit: rejects out-of-range and non-positive indexes", async () => {
  const zero = await worker.request({ op: "commit", state_id: "commit", input: "1+2*3", index: 0 });
  assert.equal(zero.ok, false);
  assert.equal(zero.error.code, "BAD_ARGS");
  const big = await worker.request({ op: "commit", state_id: "commit", input: "1+2*3", index: 99 });
  assert.equal(big.ok, false);
  assert.equal(big.error.code, "BAD_INDEX");
});

test("commit: rejects unambiguous input", async () => {
  const r = await worker.request({ op: "commit", state_id: "commit", input: "42", index: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "NOT_AMBIGUOUS");
});

test("execute: INVALID reports expected progress, then extend yields VALID", async () => {
  await worker.request({ op: "create", state_id: "repair", grammar: dependencyGrammar });
  const before = await worker.request({ op: "execute", state_id: "repair", input: "causes(A,B)" });
  assert.equal(before.ok, true);
  assert.equal(before.status, "INVALID");
  assert.ok(typeof before.error === "string" && before.error.length > 0);
  assert.ok(typeof before.progress === "string" && before.progress.length > 0);
  const ext = await worker.request({ op: "extend", state_id: "repair", grammar: widenedGrammar });
  assert.equal(ext.ok, true);
  assert.equal(ext.grammar_version, 2);
  const after = await worker.request({ op: "execute", state_id: "repair", input: "causes(A,B)" });
  assert.equal(after.ok, true);
  assert.equal(after.status, "VALID");
});

test("fork: clones grammar history and fragments", async () => {
  await worker.request({ op: "create", state_id: "fork1", grammar: dependencyGrammar });
  await worker.request({ op: "add", state_id: "fork1", fragment: "fact(A)" });
  await worker.request({ op: "extend", state_id: "fork1", grammar: widenedGrammar });
  const f = await worker.request({ op: "fork", state_id: "fork1", new_state_id: "fork1b" });
  assert.equal(f.ok, true);
  assert.equal(f.state_id, "fork1b");
  assert.equal(f.grammar_version, 2);
  assert.equal(f.fragment_count, 1);
  const insp = await worker.request({ op: "inspect", state_id: "fork1b" });
  assert.equal(insp.grammar_version, 2);
  assert.equal(insp.fragment_count, 1);
});

test("fork: mutating the child leaves the parent intact", async () => {
  await worker.request({ op: "create", state_id: "fork2", grammar: dependencyGrammar });
  await worker.request({ op: "add", state_id: "fork2", fragment: "fact(A)" });
  await worker.request({ op: "fork", state_id: "fork2", new_state_id: "fork2b" });
  await worker.request({ op: "extend", state_id: "fork2b", grammar: widenedGrammar });
  await worker.request({ op: "add", state_id: "fork2b", fragment: "causes(A,B)" });
  const parent = await worker.request({ op: "inspect", state_id: "fork2" });
  assert.equal(parent.grammar_version, 1);
  assert.equal(parent.fragment_count, 1);
  const child = await worker.request({ op: "inspect", state_id: "fork2b" });
  assert.equal(child.grammar_version, 2);
  assert.equal(child.fragment_count, 2);
});

test("fork: fork of a fork composes", async () => {
  const f = await worker.request({ op: "fork", state_id: "fork2b", new_state_id: "fork2c" });
  assert.equal(f.ok, true);
  const c = await worker.request({ op: "inspect", state_id: "fork2c" });
  assert.equal(c.grammar_version, 2);
  assert.equal(c.fragment_count, 2);
});
