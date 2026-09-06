// omp extension: registers the LLM-callable `reason` tool backed by a Marpa worker.
import type { ExtensionAPI, ExtensionContext, ToolResult } from "./types.ts";
import { WorkerClient, parseResultFrom, type ParseResult, type WorkerResponse } from "./worker-client.ts";
import { StateStore, STATE_CUSTOM_TYPE, type ReasoningState } from "./state.ts";
import { TOOL_DESCRIPTION } from "./tool-description.ts";

const OPERATION_SET = new Set<string>(["create", "add", "parse", "inspect", "extend", "reset"]);
type Operation = "create" | "add" | "parse" | "inspect" | "extend" | "reset";

interface ReasonParams {
  operation: Operation;
  state_id?: string;
  grammar?: string;
  fragment?: string;
}

function isOperation(value: unknown): value is Operation {
  return typeof value === "string" && OPERATION_SET.has(value);
}

function toReasonParams(value: Record<string, unknown>): ReasonParams | null {
  if (!isOperation(value.operation)) return null;
  return {
    operation: value.operation,
    state_id: typeof value.state_id === "string" ? value.state_id : undefined,
    grammar: typeof value.grammar === "string" ? value.grammar : undefined,
    fragment: typeof value.fragment === "string" ? value.fragment : undefined,
  };
}

function ok(text: string, details?: Record<string, unknown>): ToolResult {
  return details ? { content: [{ type: "text", text }], details } : { content: [{ type: "text", text }] };
}

function err(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

function workerErr(resp: WorkerResponse, op: string): ToolResult {
  const e = resp.error;
  const msg = typeof e === "string" ? e : e?.message ?? "unknown error";
  return err(`${op} failed: ${msg}`);
}

function describeParse(r: ParseResult): string {
  if (r.status === "AMBIGUOUS") return `AMBIGUOUS (grammar v${r.grammar_version}, ${r.value_count} interpretations)`;
  if (r.status === "INVALID") return `INVALID (grammar v${r.grammar_version})`;
  return `VALID (grammar v${r.grammar_version}, ${r.fragment_count} fragment${r.fragment_count === 1 ? "" : "s"})`;
}

function formatParse(r: ParseResult): ToolResult {
  let text: string;
  if (r.status === "VALID") {
    text = `Parse VALID (grammar v${r.grammar_version}, ${r.fragment_count} fragment${r.fragment_count === 1 ? "" : "s"}, 1 interpretation).`;
    if (r.values.length) text += `\n1. ${r.values[0]}`;
  } else if (r.status === "AMBIGUOUS") {
    text = `Parse AMBIGUOUS (grammar v${r.grammar_version}, ${r.fragment_count} fragment${r.fragment_count === 1 ? "" : "s"}, ${r.value_count} interpretations).`;
    r.values.forEach((v, i) => {
      text += `\n${i + 1}. ${v}`;
    });
    if (r.value_count > r.values.length) text += `\n... (${r.value_count - r.values.length} more not shown)`;
  } else {
    text = `Parse INVALID (grammar v${r.grammar_version}, ${r.fragment_count} fragment${r.fragment_count === 1 ? "" : "s"}).`;
    if (r.error) text += `\nError: ${r.error}`;
  }
  return { content: [{ type: "text", text }], details: { ...r } };
}

export default function (pi: ExtensionAPI) {
  const z = pi.zod;
  const worker = new WorkerClient({ onStderr: (line) => pi.logger?.debug?.(`[marpa-worker] ${line}`) });
  const store = new StateStore(worker);

  const debug = (msg: string) => pi.logger?.debug?.(`[marpa-reasoning] ${msg}`);

  const persist = async (state: ReasoningState): Promise<void> => {
    await Promise.resolve(pi.appendEntry(STATE_CUSTOM_TYPE, state.serialize()));
  };

  const persistDeletion = async (stateId: string): Promise<void> => {
    await Promise.resolve(pi.appendEntry(STATE_CUSTOM_TYPE, { state_id: stateId, deleted: true }));
  };

  const rebuild = (ctx: ExtensionContext) => {
    const entries = ctx.sessionManager.getBranch();
    store.restore(entries);
    debug(`restored ${store.size()} state(s) from ${entries.length} branch entries`);
  };

  pi.on("session_start", (_event, ctx) => rebuild(ctx));
  pi.on("session_branch", (_event, ctx) => rebuild(ctx));
  pi.on("session_tree", (_event, ctx) => rebuild(ctx));
  pi.on("session_shutdown", () => worker.terminate());

  pi.registerTool({
    name: "reason",
    label: "Reason (Marpa)",
    description: TOOL_DESCRIPTION,
    parameters: z.object({
      operation: z.enum(["create", "add", "parse", "inspect", "extend", "reset"]).describe("Which operation to perform"),
      state_id: z.string().optional().describe("State id (required for all operations except create)"),
      grammar: z.string().optional().describe("Complete grammar source (create / extend)"),
      fragment: z.string().optional().describe("Fragment text to append (add)"),
    }),
    async execute(_id, params, _signal, _onUpdate, _ctx): Promise<ToolResult> {
      const p = toReasonParams(params);
      if (!p) return err("reason: invalid parameters");
      try {
        return await dispatch(p);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: "text", text: `reason failed: ${msg}` }], details: { error: msg }, isError: true };
      }
    },
  });

  async function dispatch(p: ReasonParams): Promise<ToolResult> {
    await store.ensureSynced();
    switch (p.operation) {
      case "create":
        return opCreate(p);
      case "add":
        return opAdd(p);
      case "parse":
        return opParse(p);
      case "inspect":
        return opInspect(p);
      case "extend":
        return opExtend(p);
      case "reset":
        return opReset(p);
    }
  }

  async function opCreate(p: ReasonParams): Promise<ToolResult> {
    if (typeof p.grammar !== "string" || !p.grammar) return err("create requires a 'grammar' string");
    const resp = await worker.request({ op: "create", grammar: p.grammar });
    if (!resp.ok || typeof resp.state_id !== "string") return workerErr(resp, "create");
    const state = store.adoptNew(resp.state_id, p.grammar);
    await persist(state);
    return ok(`Created reasoning state '${state.stateId}' (grammar v${state.grammarVersion}).`, {
      state_id: state.stateId,
      grammar_version: state.grammarVersion,
    });
  }

  async function opAdd(p: ReasonParams): Promise<ToolResult> {
    if (typeof p.state_id !== "string") return err("add requires 'state_id'");
    if (typeof p.fragment !== "string") return err("add requires a 'fragment' string");
    const resp = await worker.request({ op: "add", state_id: p.state_id, fragment: p.fragment });
    if (!resp.ok || typeof resp.fragment_id !== "string") return workerErr(resp, "add");
    const state = store.get(p.state_id);
    if (!state) return err(`state '${p.state_id}' not found`);
    state.addFragment(resp.fragment_id, resp.seq ?? 0, p.fragment);
    await persist(state);
    return ok(`Added fragment ${resp.fragment_id} (#${resp.seq}).`, {
      state_id: state.stateId,
      fragment_id: resp.fragment_id,
      seq: resp.seq,
    });
  }

  async function opParse(p: ReasonParams): Promise<ToolResult> {
    if (typeof p.state_id !== "string") return err("parse requires 'state_id'");
    const resp = await worker.request({ op: "parse", state_id: p.state_id });
    if (!resp.ok) return workerErr(resp, "parse");
    const pr = parseResultFrom(resp);
    if (!pr) return err("parse returned an unexpected result shape");
    const state = store.get(p.state_id);
    if (state) {
      state.lastParse = pr;
      await persist(state);
    }
    return formatParse(pr);
  }

  async function opInspect(p: ReasonParams): Promise<ToolResult> {
    if (typeof p.state_id !== "string") return err("inspect requires 'state_id'");
    const state = store.get(p.state_id);
    if (!state) return err(`state '${p.state_id}' not found`);
    let text = `State '${state.stateId}' (grammar v${state.grammarVersion}, ${state.fragments.length} fragment${state.fragments.length === 1 ? "" : "s"}).`;
    text += state.lastParse ? `\nLast parse: ${describeParse(state.lastParse)}` : `\nNot yet parsed.`;
    return ok(text, state.serialize());
  }

  async function opExtend(p: ReasonParams): Promise<ToolResult> {
    if (typeof p.state_id !== "string") return err("extend requires 'state_id'");
    if (typeof p.grammar !== "string" || !p.grammar) return err("extend requires a 'grammar' string");
    const resp = await worker.request({ op: "extend", state_id: p.state_id, grammar: p.grammar });
    if (!resp.ok || typeof resp.grammar_version !== "number") return workerErr(resp, "extend");
    const pr = parseResultFrom(resp);
    const state = store.get(p.state_id);
    if (!state) return err(`state '${p.state_id}' not found`);
    state.advanceGrammar(resp.grammar_version, p.grammar, pr);
    await persist(state);
    return ok(`Extended to grammar v${resp.grammar_version}. ${pr ? describeParse(pr) : "no parse result"}`, {
      state_id: state.stateId,
      grammar_version: resp.grammar_version,
    });
  }

  async function opReset(p: ReasonParams): Promise<ToolResult> {
    if (typeof p.state_id !== "string") return err("reset requires 'state_id'");
    const resp = await worker.request({ op: "reset", state_id: p.state_id });
    if (!resp.ok) return workerErr(resp, "reset");
    store.remove(p.state_id);
    await persistDeletion(p.state_id);
    return ok(`Reset state '${p.state_id}'.`, { state_id: p.state_id, reset: true });
  }
}
