// Persistent (within an omp session) client for the Marpa JSONL worker.
// Lazily spawns Strawberry perl, correlates requests by id, serializes requests,
// and exposes an `epoch` counter so the extension can replay state after a respawn.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { resolvePerlPath, resolveWorkerScript } from "./worker-paths.ts";

export type ParseStatus = "VALID" | "AMBIGUOUS" | "INVALID";

export interface WorkerError {
  code: string;
  message: string;
}

export interface WorkerResponse {
  id: number | string | null;
  ok: boolean;
  error?: WorkerError | string;
  state_id?: string;
  grammar_version?: number;
  fragment_id?: string;
  seq?: number;
  fragment_count?: number;
  status?: ParseStatus;
  values?: string[];
  value_count?: number;
  grammar_source?: string;
  last_parse?: unknown;
}

export interface ParseResult {
  status: ParseStatus;
  grammar_version: number;
  fragment_count: number;
  values: string[];
  value_count: number;
  error?: string;
}

/** Validate an unknown value into a ParseResult (used for worker responses and persisted state). */
export function parseResultFrom(value: unknown): ParseResult | null {
  if (typeof value !== "object" || value === null) return null;
  const r = value as Record<string, unknown>;
  if (r.status !== "VALID" && r.status !== "AMBIGUOUS" && r.status !== "INVALID") return null;
  return {
    status: r.status,
    grammar_version: typeof r.grammar_version === "number" ? r.grammar_version : 0,
    fragment_count: typeof r.fragment_count === "number" ? r.fragment_count : 0,
    values: Array.isArray(r.values) ? r.values.filter((x): x is string => typeof x === "string") : [],
    value_count: typeof r.value_count === "number" ? r.value_count : 0,
    ...(typeof r.error === "string" ? { error: r.error } : {}),
  };
}

const REQUEST_TIMEOUT_MS = 30_000;

interface Pending {
  resolve: (r: WorkerResponse) => void;
  reject: (e: Error) => void;
}

/** The surface StateStore depends on; WorkerClient implements it, tests mock it. */
export interface WorkerLike {
  readonly epoch: number;
  ensureStarted(): void;
  request(op: Record<string, unknown>): Promise<WorkerResponse>;
}

export class WorkerClient {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private chain: Promise<void> = Promise.resolve();
  private _epoch = 0;
  private onStderr?: (line: string) => void;

  constructor(options?: { onStderr?: (line: string) => void }) {
    this.onStderr = options?.onStderr;
  }

  /** Increments each time the worker process is (re)spawned. */
  get epoch(): number {
    return this._epoch;
  }

  /** Idempotently spawn the worker if it is not running. */
  ensureStarted(): void {
    if (this.proc) return;
    this.proc = spawn(resolvePerlPath(), [resolveWorkerScript()], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, LC_ALL: "C", LANG: "C" },
    });
    this._epoch++;
    this.buffer = "";
    const proc = this.proc;

    proc.stdout.on("data", (d: Buffer) => this.onData(d));
    proc.stderr.on("data", (d: Buffer) => {
      if (!this.onStderr) return;
      for (const line of d.toString("utf8").split("\n")) {
        if (line.trim()) this.onStderr(line);
      }
    });
    proc.on("exit", (code) => {
      if (this.proc === proc) {
        this.proc = null;
        this.failAll(new Error(`Marpa worker exited (code ${code})`));
      }
    });
    proc.on("error", (err) => {
      if (this.proc === proc) {
        this.proc = null;
        this.failAll(err);
      }
    });
  }

  /** Serialized request: one JSON object in, exactly one response out. */
  request(op: Record<string, unknown>): Promise<WorkerResponse> {
    const run = () => this.doRequest(op);
    const result = this.chain.then(run, run);
    this.chain = result.then(() => undefined, () => undefined);
    return result;
  }

  terminate(): void {
    const proc = this.proc;
    if (proc) {
      this.proc = null;
      try {
        proc.stdin.end();
      } catch {
        /* ignore */
      }
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
    }
    this.failAll(new Error("Marpa worker terminated"));
  }

  private doRequest(op: Record<string, unknown>): Promise<WorkerResponse> {
    const { promise, resolve, reject } = Promise.withResolvers<WorkerResponse>();
    this.ensureStarted();
    const proc = this.proc!;
    const id = this.nextId++;
    const timer = setTimeout(() => {
      this.pending.delete(id);
      this.terminate();
      reject(new Error("Marpa worker request timed out"));
    }, REQUEST_TIMEOUT_MS);
    this.pending.set(id, {
      resolve: (r) => {
        clearTimeout(timer);
        resolve(r);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    proc.stdin.write(JSON.stringify({ ...op, id }) + "\n");
    return promise;
  }

  private onData(d: Buffer) {
    this.buffer += d.toString("utf8");
    let i: number;
    while ((i = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, i).trim();
      this.buffer = this.buffer.slice(i + 1);
      if (!line) continue;
      let resp: WorkerResponse;
      try {
        resp = JSON.parse(line) as WorkerResponse;
      } catch {
        continue;
      }
      const p = typeof resp.id === "number" ? this.pending.get(resp.id) : undefined;
      if (p) {
        this.pending.delete(resp.id as number);
        p.resolve(resp);
      }
    }
  }

  private failAll(err: Error) {
    for (const [, p] of this.pending) p.reject(err);
    this.pending.clear();
    this.buffer = "";
  }
}
