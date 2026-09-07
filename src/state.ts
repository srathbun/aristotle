// Durable reasoning-state model and session-entry reconstruction.
import type { SessionEntry } from "./types.ts";
import type { WorkerLike } from "./worker-client.ts";
import { parseResultFrom, type ParseResult } from "./worker-client.ts";

// Reverse-domain-qualified custom type (not in the core-reserved set).
export const STATE_CUSTOM_TYPE = "dev.aristotle.marpa-reasoning.state";

export interface FragmentRecord {
  id: string;
  seq: number;
  text: string;
}

function asStringRecord(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function asFragments(value: unknown): FragmentRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((f): f is FragmentRecord => {
    if (typeof f !== "object" || f === null) return false;
    const r = f as Record<string, unknown>;
    return typeof r.id === "string" && typeof r.seq === "number" && typeof r.text === "string";
  });
}

export class ReasoningState {
  stateId: string;
  grammarVersion: number;
  grammarSource: string;
  grammarHistory: Record<string, string>;
  fragments: FragmentRecord[];
  lastParse: ParseResult | null;

  constructor(
    stateId: string,
    grammarVersion: number,
    grammarSource: string,
    grammarHistory: Record<string, string>,
    fragments: FragmentRecord[] = [],
    lastParse: ParseResult | null = null,
  ) {
    this.stateId = stateId;
    this.grammarVersion = grammarVersion;
    this.grammarSource = grammarSource;
    this.grammarHistory = grammarHistory;
    this.fragments = fragments;
    this.lastParse = lastParse;
  }

  static create(stateId: string, grammarSource: string): ReasoningState {
    return new ReasoningState(stateId, 1, grammarSource, { "1": grammarSource }, [], null);
  }

  addFragment(id: string, seq: number, text: string): void {
    this.fragments.push({ id, seq, text });
  }

  advanceGrammar(version: number, source: string, lastParse: ParseResult | null): void {
    this.grammarVersion = version;
    this.grammarSource = source;
    this.grammarHistory[String(version)] = source;
    this.lastParse = lastParse;
  }

  /** Deep-clone this state under a new id; grammar history and fragments are copied. */
  forkAs(newStateId: string): ReasoningState {
    return new ReasoningState(
      newStateId,
      this.grammarVersion,
      this.grammarSource,
      { ...this.grammarHistory },
      this.fragments.map((f) => ({ ...f })),
      this.lastParse,
    );
  }

  serialize(): Record<string, unknown> {
    return {
      state_id: this.stateId,
      grammar_version: this.grammarVersion,
      grammar_source: this.grammarSource,
      grammar_history: this.grammarHistory,
      fragments: this.fragments,
      last_parse: this.lastParse,
    };
  }

  static deserialize(data: unknown): ReasoningState | null {
    if (typeof data !== "object" || data === null) return null;
    const d = data as Record<string, unknown>;
    if (typeof d.state_id !== "string" || typeof d.grammar_version !== "number") return null;
    return new ReasoningState(
      d.state_id,
      d.grammar_version,
      typeof d.grammar_source === "string" ? d.grammar_source : "",
      asStringRecord(d.grammar_history),
      asFragments(d.fragments),
      parseResultFrom(d.last_parse),
    );
  }
}

/** Rebuild the latest snapshot of each state from append-only session entries. */
export function rebuildStates(entries: SessionEntry[]): Map<string, ReasoningState> {
  const map = new Map<string, ReasoningState>();
  for (const e of entries) {
    if (e.type !== "custom" || e.customType !== STATE_CUSTOM_TYPE) continue;
    const d = e.data;
    if (typeof d === "object" && d !== null) {
      const rec = d as Record<string, unknown>;
      if (typeof rec.state_id === "string" && rec.deleted === true) {
        map.delete(rec.state_id);
        continue;
      }
    }
    const s = ReasoningState.deserialize(e.data);
    if (s) map.set(s.stateId, s);
  }
  return map;
}

/**
 * Source of truth for reasoning states within a session. The worker is an
 * ephemeral engine; states are replayed into it whenever it is (re)spawned.
 */
export class StateStore {
  private states = new Map<string, ReasoningState>();
  private syncEpoch = new Map<string, number>();
  private client: WorkerLike;

  constructor(client: WorkerLike) {
    this.client = client;
  }

  restore(entries: SessionEntry[]): void {
    this.states = rebuildStates(entries);
    this.syncEpoch.clear();
  }

  get(stateId: string): ReasoningState | undefined {
    return this.states.get(stateId);
  }

  size(): number {
    return this.states.size;
  }

  adoptNew(stateId: string, grammarSource: string): ReasoningState {
    const s = ReasoningState.create(stateId, grammarSource);
    this.states.set(stateId, s);
    this.syncEpoch.set(stateId, this.client.epoch);
    return s;
  }

  /** Register an already-forked state (already present in the worker) at the current epoch. */
  adoptFork(state: ReasoningState): void {
    this.states.set(state.stateId, state);
    this.syncEpoch.set(state.stateId, this.client.epoch);
  }

  remove(stateId: string): void {
    this.states.delete(stateId);
    this.syncEpoch.delete(stateId);
  }

  /** Replay any state the worker no longer has (fresh spawn or session restore). */
  async ensureSynced(): Promise<void> {
    this.client.ensureStarted();
    const epoch = this.client.epoch;
    for (const [id, s] of this.states) {
      if (this.syncEpoch.get(id) !== epoch) {
        await this.replay(s);
        this.syncEpoch.set(id, epoch);
      }
    }
  }

  private async replay(s: ReasoningState): Promise<void> {
    const versions = Object.keys(s.grammarHistory)
      .map(Number)
      .sort((a, b) => a - b);
    const first = versions[0];
    if (first === undefined) return;
    await this.client.request({ op: "create", state_id: s.stateId, grammar: s.grammarHistory[String(first)] });
    for (const v of versions.slice(1)) {
      await this.client.request({ op: "extend", state_id: s.stateId, grammar: s.grammarHistory[String(v)] });
    }
    for (const f of s.fragments) {
      await this.client.request({ op: "add", state_id: s.stateId, fragment: f.text });
    }
  }
}
