// Resolves the Perl interpreter and the worker script path.
// Shared by worker-client.ts and the worker protocol tests (no omp dependency).
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Order: MARP_PERL env -> Strawberry Perl -> "perl" on PATH. */
export function resolvePerlPath(): string {
  if (process.env.MARP_PERL) return process.env.MARP_PERL;
  const strawberry = "C:/Strawberry/perl/bin/perl.exe";
  if (existsSync(strawberry)) return strawberry;
  return "perl";
}

/** Order: MARP_WORKER env -> repo-relative worker/marpa-worker.pl. */
export function resolveWorkerScript(): string {
  if (process.env.MARP_WORKER) return process.env.MARP_WORKER;
  return join(repoRoot, "worker", "marpa-worker.pl");
}
