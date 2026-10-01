// M14 deterministic harness: exercises the turn-parser core against the real
// Marpa worker (no OMP runtime needed), driving the same handlers the adapter
// pumps in the same order (message_end → feedTurn → persist → restore).
import { test } from "node:test";
import assert from "node:assert/strict";
import { WorkerClient } from "../src/worker-client.ts";
import { TurnParserSession, rebuildTurnState, TURN_STATE_CUSTOM_TYPE } from "../src/turn-parser.ts";
import type { SessionEntry } from "../src/types.ts";

// Turn deltas under the dangling-else grammar:
//   k=3 ifs, l=1 else → C(3,1) = 3 interpretations  (AMBIGUOUS)
//   + "else s"   l=2  → C(3,2) = 3 interpretations  (AMBIGUOUS, survives)
//   + "else s"   l=3  → C(3,3) = 1 interpretation   (VALID, resolved)
const T1 = "if then if then if then s else s";
const T2 = "else s";
const T3 = "else s";

/** In-memory persistence shim: appends serialized snapshots as session entries. */
function makeCollector() {
  const entries: SessionEntry[] = [];
  const persist = (data: Record<string, unknown>): void => {
    entries.push({ type: "custom", customType: TURN_STATE_CUSTOM_TYPE, data });
  };
  return { entries, persist };
}

// Each test owns a fresh worker: in production the extension factory creates one
// WorkerClient per agent/session, so a fresh process matches the real model.

test("three turns: ambiguity survives then resolves (3 → 3 → 1)", async () => {
  const worker = new WorkerClient();
  try {
    const { entries, persist } = makeCollector();
    const s = new TurnParserSession(worker, { persist });

    const d1 = await s.feedTurn(T1);
    assert.equal(d1.status, "AMBIGUOUS");
    assert.equal(d1.valueCount, 3);
    assert.equal(d1.ambiguous, true);
    assert.equal(d1.delta, "opened");
    assert.equal(d1.fragmentCount, 1);
    assert.equal(d1.values.length, 3);
    assert.equal(new Set(d1.values).size, 3, "interpretations must be distinct parse trees");

    const d2 = await s.feedTurn(T2);
    assert.equal(d2.status, "AMBIGUOUS");
    assert.equal(d2.valueCount, 3, "ambiguity survives a second input");
    assert.equal(d2.delta, "kept");
    assert.equal(d2.fragmentCount, 2);
    assert.equal(new Set(d2.values).size, 3);

    const d3 = await s.feedTurn(T3);
    assert.equal(d3.status, "VALID");
    assert.equal(d3.valueCount, 1);
    assert.equal(d3.ambiguous, false);
    assert.equal(d3.delta, "resolved");
    assert.equal(d3.fragmentCount, 3);
    assert.equal(d3.values.length, 1);

    assert.equal(entries.length, 3, "state persisted after each turn");

    console.log("=== OBSERVED TRAJECTORY ===");
    console.log(`turn 1: ${d1.status} ${d1.valueCount} (${d1.delta})`);
    for (const v of d1.values) console.log(`    ${v}`);
    console.log(`turn 2: ${d2.status} ${d2.valueCount} (${d2.delta})`);
    for (const v of d2.values) console.log(`    ${v}`);
    console.log(`turn 3: ${d3.status} ${d3.valueCount} (${d3.delta})`);
    for (const v of d3.values) console.log(`    ${v}`);
    console.log("=== CONTEXT INJECTION ===");
    console.log(s.summarize());
  } finally {
    worker.terminate();
  }
});

test("incremental: each turn appends, does not reparse independently", async () => {
  const worker = new WorkerClient();
  try {
    const s = new TurnParserSession(worker);
    const d1 = await s.feedTurn(T1);
    const d2 = await s.feedTurn(T2);
    assert.equal(d1.fragmentCount, 1);
    assert.equal(d2.fragmentCount, 2);
    // A bare "else s" fragment is INVALID on its own (no preceding `if`). The fact
    // that turn 2 stays AMBIGUOUS/3 proves the parser re-parsed the ACCUMULATED
    // input ("if…if…if…s else s" + "else s"), not the delta independently.
    assert.equal(d2.valueCount, 3);
  } finally {
    worker.terminate();
  }
});

test("state persists and reconstructs across a worker respawn", async () => {
  const worker = new WorkerClient();
  try {
    const { entries, persist } = makeCollector();
    const s = new TurnParserSession(worker, { persist });
    await s.feedTurn(T1);
    await s.feedTurn(T2);
    await s.feedTurn(T3);

    // Reconstruct the durable snapshot from persisted session entries.
    const rebuilt = rebuildTurnState(entries);
    assert.ok(rebuilt, "a turn-parser state is reconstructed from entries");
    assert.equal(rebuilt.fragments.length, 3);
    assert.equal(rebuilt.lastParse?.status, "VALID");
    assert.equal(rebuilt.lastParse?.value_count, 1);

    // A brand-new worker (fresh epoch) must replay the 3 fragments and continue
    // from fragment 4 — not restart at 1.
    const worker2 = new WorkerClient();
    try {
      const s2 = new TurnParserSession(worker2, { persist: () => {} });
      s2.restore(entries);
      const d4 = await s2.feedTurn(T2); // append a 4th "else s": l=4 > k=3 → INVALID
      assert.equal(d4.fragmentCount, 4, "continues from the restored 3 fragments");
      assert.equal(d4.status, "INVALID", "over-constrained input is honestly INVALID");
    } finally {
      worker2.terminate();
    }
  } finally {
    worker.terminate();
  }
});