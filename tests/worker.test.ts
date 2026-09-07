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
