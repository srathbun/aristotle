// M14: incremental turn-parser core.
//
// Accumulates completed assistant turns as Marpa fragments under ONE grammar,
// re-parsing the accumulated input after each turn and surfacing the surviving
// parse forest (ambiguity) as first-class data. Reuses the existing Marpa
// worker + `ReasoningState` persistence; is engine-agnostic so the OMP adapter
// can be a separate file and the deterministic harness can drive it directly.
import { ReasoningState } from "./state.ts";
import { parseResultFrom, type ParseStatus, type WorkerLike } from "./worker-client.ts";
import type { SessionEntry } from "./types.ts";

// Reverse-domain-qualified custom type, distinct from the `reason` tool's
// STATE_CUSTOM_TYPE, so the two extensions never read each other's entries.
export const TURN_STATE_CUSTOM_TYPE = "dev.aristotle.turn-parser.state";

// Dangling-else: the textbook ambiguity. With k `if/then` and l `else s` in the
// accumulated input, Marpa reports C(k,l) parse trees — "which `if` does each
// `else` close?" A later `else s` therefore changes the surviving forest.
// Turn deltas that append `else s` first preserve and then resolve the ambiguity.
export const TURN_GRAMMAR = [
  ":default ::= action => ::array",
  ":start ::= stmt",
  "stmt ::= 'if' 'then' stmt 'else' stmt | 'if' 'then' stmt | 's'",
  ":discard ~ whitespace",
  "whitespace ~ [\\s]+",
].join("\n");

/** Default per-agent state id (one turn-parser state per agent/session). */
export const DEFAULT_STATE_ID = "agent";

export interface TurnDiagnostic {
  /** 1-based turn index within this agent's session. */
  turnIndex: number;
  /** The assistant text (delta) fed this turn. */
  input: string;
  /** Tool-call names in this turn, for diagnostics only (not parsed). */
  toolNames: string[];
  status: ParseStatus;
  /** Surviving interpretations for the accumulated input. */
  valueCount: number;
  /** Interpretation count of the previous turn (null on the first turn). */
  priorValueCount: number | null;
  ambiguous: boolean;
  /** Surviving parse-tree S-expressions (worker caps at 5). */
  values: string[];
  /** Total fragments fed so far (proves incrementality). */
  fragmentCount: number;
  grammarVersion: number;
  delta: "opened" | "kept" | "grew" | "shrank" | "resolved" | "none" | "invalid";
  error?: string;
  persisted: boolean;
}

function classifyDelta(status: ParseStatus, prior: number | null, now: number): TurnDiagnostic["delta"] {
  if (status === "INVALID") return "invalid";
  if (prior === null || prior === 0) return now > 1 ? "opened" : "none";
  if (prior > 1 && now > 1) return now > prior ? "grew" : now < prior ? "shrank" : "kept";
  if (prior > 1 && now === 1) return "resolved";
  if (prior === 1 && now > 1) return "opened";
  return "none";
}

/** Latest per-agent turn-parser snapshot from append-only session entries. */
export function rebuildTurnState(entries: SessionEntry[]): ReasoningState | null {
  let latest: ReasoningState | null = null;
  for (const e of entries) {
    if (e.type !== "custom" || e.customType !== TURN_STATE_CUSTOM_TYPE) continue;
    const d = e.data;
    if (typeof d === "object" && d !== null) {
      const rec = d as Record<string, unknown>;
      if (typeof rec.state_id === "string" && rec.deleted === true) {
        latest = null;
        continue;
      }
    }
    const s = ReasoningState.deserialize(e.data);
    if (s) latest = s;
  }
  return latest;
}

export interface TurnParserOptions {
  stateId?: string;
  grammar?: string;
  persist?: (data: Record<string, unknown>) => void | Promise<void>;
}

export class TurnParserSession {
  private client: WorkerLike;
  private stateId: string;
  private grammar: string;
  private persist?: (data: Record<string, unknown>) => void | Promise<void>;

  /** Current durable state (null until the first turn is fed or restored). */
  state: ReasoningState | null = null;
  lastDiagnostic: TurnDiagnostic | null = null;

  private syncedEpoch = -1;
  private turnIndex = 0;

  constructor(client: WorkerLike, options: TurnParserOptions = {}) {
    this.client = client;
    this.stateId = options.stateId ?? DEFAULT_STATE_ID;
    this.grammar = options.grammar ?? TURN_GRAMMAR;
    this.persist = options.persist;
  }

  /** Rebuild from session entries; forces a worker replay on the next feed. */
  restore(entries: SessionEntry[]): void {
    this.state = rebuildTurnState(entries);
    this.syncedEpoch = -1;
  }

  /**
   * Feed one completed assistant turn (a delta) and re-parse the accumulated
   * input. Returns the ambiguity diagnostic and persists the new state.
   */
  async feedTurn(text: string, meta: { toolNames?: string[] } = {}): Promise<TurnDiagnostic> {
    if (text.length === 0) throw new Error("feedTurn: empty turn text");
    this.turnIndex += 1;

    const prior = this.state?.lastParse ?? null;
    const priorValueCount = prior !== null && prior.status !== "INVALID" ? prior.value_count : null;

    await this.ensureSynced();

    if (!this.state) {
      const resp = await this.client.request({ op: "create", state_id: this.stateId, grammar: this.grammar });
      if (!resp.ok || typeof resp.state_id !== "string") {
        throw new Error(`create failed: ${describeWorkerError(resp.error)}`);
      }
      this.state = ReasoningState.create(resp.state_id, this.grammar);
      this.syncedEpoch = this.client.epoch;
    }

    const addResp = await this.client.request({ op: "add", state_id: this.state.stateId, fragment: text });
    if (!addResp.ok || typeof addResp.fragment_id !== "string") {
      throw new Error(`add failed: ${describeWorkerError(addResp.error)}`);
    }
    this.state.addFragment(addResp.fragment_id, addResp.seq ?? 0, text);

    const parseResp = await this.client.request({ op: "parse", state_id: this.state.stateId });
    if (!parseResp.ok) {
      throw new Error(`parse failed: ${describeWorkerError(parseResp.error)}`);
    }
    const pr = parseResultFrom(parseResp);
    if (!pr) throw new Error("parse returned an unexpected result shape");
    this.state.lastParse = pr;

    let persisted = false;
    if (this.persist) {
      await this.persist(this.state.serialize());
      persisted = true;
    }

    const diag: TurnDiagnostic = {
      turnIndex: this.turnIndex,
      input: text,
      toolNames: meta.toolNames ?? [],
      status: pr.status,
      valueCount: pr.value_count,
      priorValueCount,
      ambiguous: pr.status === "AMBIGUOUS",
      values: pr.values,
      fragmentCount: pr.fragment_count,
      grammarVersion: pr.grammar_version,
      delta: classifyDelta(pr.status, priorValueCount, pr.value_count),
      ...(pr.error !== undefined ? { error: pr.error } : {}),
      persisted,
    };
    this.lastDiagnostic = diag;
    return diag;
  }

  /** Compact, LLM-facing summary of the current parser state (null while empty). */
  summarize(): string | null {
    const s = this.state;
    if (!s) return null;
    const p = s.lastParse;
    const lines: string[] = ["[Aristotle turn parser]"];
    lines.push(`grammar: dangling-else v${s.grammarVersion}`);
    if (!p) {
      lines.push(`fragments fed: ${s.fragments.length}`);
      lines.push("not yet parsed");
    } else if (p.status === "INVALID") {
      lines.push(`turns parsed: ${p.fragment_count}`);
      lines.push("parse: INVALID");
      if (p.error) lines.push(`error: ${p.error}`);
    } else {
      const d = this.lastDiagnostic;
      const trend = d && d.priorValueCount !== null ? ` (was ${d.priorValueCount})` : "";
      lines.push(`turns parsed: ${p.fragment_count}`);
      lines.push(`parse: ${p.status}`);
      lines.push(
        p.status === "AMBIGUOUS"
          ? `ambiguous: true — ${p.value_count} interpretations${trend}`
          : `ambiguous: false — ${p.value_count} interpretation${trend}`,
      );
      lines.push("surviving:");
      for (const v of p.values) lines.push(`  - ${v}`);
      if (p.value_count > p.values.length) lines.push(`  … ${p.value_count - p.values.length} more`);
    }
    return lines.join("\n");
  }

  serializeState(): Record<string, unknown> | null {
    return this.state ? this.state.serialize() : null;
  }

  private async ensureSynced(): Promise<void> {
    this.client.ensureStarted();
    if (this.state && this.syncedEpoch !== this.client.epoch) {
      await this.replay(this.state);
      this.syncedEpoch = this.client.epoch;
    }
  }

  /** Re-create + refill the worker's ephemeral state from the durable snapshot. */
  private async replay(s: ReasoningState): Promise<void> {
    const versions = Object.keys(s.grammarHistory).map(Number).sort((a, b) => a - b);
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

function describeWorkerError(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const m = (error as { message: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "unknown error";
}