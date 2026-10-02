// M14: OMP extension adapter.
//
// Wires the incremental turn-parser into the OMP turn lifecycle using only the
// existing extension API (no core changes):
//
//   completed assistant turn  →  message_end      →  feedTurn (add + parse)
//   persisted parser state    →  appendEntry / getBranch  (session rebuild)
//   next LLM request          →  context          →  inject compact summary
//
// Tool-call blocks are recorded for diagnostics but not parsed.
//
// Opt-in: this is a research harness, not a default feature. It is silent unless
// ARISTOTLE_TURN_PARSER is set to a truthy value (1/true/yes/on), so an unrelated
// session never accumulates turns nor injects `[Aristotle turn parser]` context.
import type { ExtensionAPI, ExtensionContext } from "./types.ts";
import { WorkerClient } from "./worker-client.ts";
import { TurnParserSession, TURN_STATE_CUSTOM_TYPE } from "./turn-parser.ts";

interface MessageLike {
  role?: string;
  content?: unknown;
}

function extractText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (b): b is { type: string; text: string } =>
        typeof b === "object" && b !== null && (b as { type?: string }).type === "text",
    )
    .map((b) => (b as { text: string }).text)
    .join("\n");
}

function extractToolNames(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  const names: string[] = [];
  for (const b of content) {
    if (typeof b !== "object" || b === null) continue;
    const rec = b as Record<string, unknown>;
    if (rec.type !== "toolCall") continue;
    names.push(typeof rec.name === "string" ? rec.name : typeof rec.toolName === "string" ? rec.toolName : "?");
  }
  return names;
}

export default function (pi: ExtensionAPI): void {
  // Opt-in switch: off by default so the parser never leaves artifacts in sessions
  // not doing turn-parsing work. Enable per-session with ARISTOTLE_TURN_PARSER=1.
  const enabled = ["1", "true", "yes", "on"].includes((process.env.ARISTOTLE_TURN_PARSER ?? "").toLowerCase());
  if (!enabled) return;

  const worker = new WorkerClient({ onStderr: (line) => pi.logger?.debug?.(`[turn-parser worker] ${line}`) });

  const session = new TurnParserSession(worker, {
    persist: (data) => {
      pi.appendEntry(TURN_STATE_CUSTOM_TYPE, data);
    },
  });

  const rebuild = (ctx: ExtensionContext): void => {
    const entries = ctx.sessionManager.getBranch();
    session.restore(entries);
    const n = session.state ? `${session.state.fragments.length} fragment(s)` : "empty";
    pi.logger?.debug?.(`[turn-parser] restored state (${n}) from ${entries.length} branch entries`);
  };

  pi.on("session_start", (_event, ctx) => rebuild(ctx));
  pi.on("session_branch", (_event, ctx) => rebuild(ctx));
  pi.on("session_tree", (_event, ctx) => rebuild(ctx));
  pi.on("session_shutdown", () => worker.terminate());

  pi.on("message_end", async (event) => {
    const msg = (event as { message?: MessageLike }).message;
    if (!msg || msg.role !== "assistant") return;
    const text = extractText(msg.content).trim();
    if (!text) return;
    const toolNames = extractToolNames(msg.content);
    try {
      const diag = await session.feedTurn(text, { toolNames });
      pi.logger?.info?.(
        `[turn-parser] T${diag.turnIndex} ${diag.status} ${diag.valueCount} interp(s) (${diag.delta}) — ${diag.fragmentCount} fragments`,
      );
    } catch (e) {
      pi.logger?.error?.(`[turn-parser] feedTurn failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  pi.on("context", async (event) => {
    const summary = session.summarize();
    if (!summary) return undefined;
    const messages = (event as { messages?: unknown[] }).messages ?? [];
    return { messages: [...messages, { role: "user", content: [{ type: "text", text: summary }] }] };
  });
}