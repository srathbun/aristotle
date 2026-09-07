import { test } from "node:test";
import assert from "node:assert/strict";
import { ReasoningState, rebuildStates, StateStore, STATE_CUSTOM_TYPE } from "../src/state.ts";
import type { SessionEntry } from "../src/types.ts";
import type { WorkerLike, WorkerResponse } from "../src/worker-client.ts";

class MockClient implements WorkerLike {
  epoch = 0;
  ops: Array<Record<string, unknown>> = [];

  ensureStarted(): void {
    /* no-op */
  }

  async request(op: Record<string, unknown>): Promise<WorkerResponse> {
    this.ops.push(op);
    return { id: 0, ok: true };
  }
}

function entry(data: unknown): SessionEntry {
  return { type: "custom", customType: STATE_CUSTOM_TYPE, data };
}

test("serialize/deserialize round-trips a full state", () => {
  const s = ReasoningState.create("r1", "g1");
  s.advanceGrammar(2, "g2", {
    status: "VALID",
    grammar_version: 2,
    fragment_count: 2,
    values: ["((a))"],
    value_count: 1,
  });
  s.addFragment("f1", 1, "fact(A)");
  s.addFragment("f2", 2, "depends(A,B)");

  const restored = ReasoningState.deserialize(s.serialize());
  assert.ok(restored);
  assert.equal(restored.stateId, "r1");
  assert.equal(restored.grammarVersion, 2);
  assert.equal(restored.grammarSource, "g2");
  assert.deepEqual(restored.grammarHistory, { "1": "g1", "2": "g2" });
  assert.deepEqual(restored.fragments, [
    { id: "f1", seq: 1, text: "fact(A)" },
    { id: "f2", seq: 2, text: "depends(A,B)" },
  ]);
  assert.equal(restored.lastParse?.status, "VALID");
});

test("deserialize rejects malformed data", () => {
  assert.equal(ReasoningState.deserialize(null), null);
  assert.equal(ReasoningState.deserialize("x"), null);
  assert.equal(ReasoningState.deserialize({}), null);
  assert.equal(ReasoningState.deserialize({ state_id: "r1" }), null);
});

test("rebuild keeps only the latest snapshot per state_id", () => {
  const first = ReasoningState.create("r1", "g1");
  const later = ReasoningState.create("r1", "g2");
  const map = rebuildStates([entry(first.serialize()), entry(later.serialize())]);
  assert.equal(map.size, 1);
  assert.equal(map.get("r1")?.grammarSource, "g2");
});

test("rebuild honors a deletion marker", () => {
  const s = ReasoningState.create("r1", "g1");
  const map = rebuildStates([entry(s.serialize()), entry({ state_id: "r1", deleted: true })]);
  assert.equal(map.size, 0);
});

test("rebuild ignores other custom types", () => {
  const s = ReasoningState.create("r1", "g1");
  const other: SessionEntry = { type: "custom", customType: "core.other", data: { n: 1 } };
  const map = rebuildStates([entry(s.serialize()), other]);
  assert.equal(map.size, 1);
});

test("ensureSynced replays full grammar history and fragments in order", async () => {
  const client = new MockClient();
  const store = new StateStore(client);
  const s = ReasoningState.create("r1", "g1");
  s.advanceGrammar(2, "g2", null);
  s.addFragment("f1", 1, "fact(A)");
  s.addFragment("f2", 2, "depends(A,B)");

  store.restore([entry(s.serialize())]);
  await store.ensureSynced();

  assert.deepEqual(client.ops.map((o) => o.op), ["create", "extend", "add", "add"]);
  assert.equal(client.ops[0].state_id, "r1");
  assert.equal(client.ops[0].grammar, "g1");
  assert.equal(client.ops[1].grammar, "g2");
  assert.equal(client.ops[2].fragment, "fact(A)");
  assert.equal(client.ops[3].fragment, "depends(A,B)");
});

test("a state adopted at the current epoch is not replayed", async () => {
  const client = new MockClient();
  const store = new StateStore(client);
  store.adoptNew("r1", "g1");
  await store.ensureSynced();
  assert.equal(client.ops.length, 0);
});

test("a state is replayed after a worker epoch bump", async () => {
  const client = new MockClient();
  const store = new StateStore(client);
  store.adoptNew("r1", "g1");
  client.epoch = 1; // simulate worker respawn
  await store.ensureSynced();
  assert.deepEqual(client.ops.map((o) => o.op), ["create"]);
  assert.equal(client.ops[0].grammar, "g1");
});

test("forkAs deep-clones history and fragments, isolating the parent", () => {
  const s = ReasoningState.create("r1", "g1");
  s.addFragment("f1", 1, "fact(A)");
  s.advanceGrammar(2, "g2", null);

  const child = s.forkAs("r2");
  assert.equal(child.stateId, "r2");
  assert.equal(child.grammarVersion, 2);
  assert.deepEqual(child.grammarHistory, { "1": "g1", "2": "g2" });
  assert.equal(child.fragments.length, 1);

  // Mutating the child must not affect the parent.
  child.addFragment("f2", 2, "depends(A,B)");
  child.advanceGrammar(3, "g3", null);
  assert.equal(s.fragments.length, 1);
  assert.equal(s.grammarVersion, 2);
  assert.equal(child.fragments.length, 2);
  assert.equal(child.grammarVersion, 3);
});
