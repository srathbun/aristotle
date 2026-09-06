// Wrapper that runs the headless omp smoke test through the test harness.
// Skipped by default (it drives the LLM and costs tokens); run with SMOKE=1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("headless omp smoke scenarios (SMOKE=1)", { skip: process.env.SMOKE !== "1" }, () => {
  const r = spawnSync("node", ["--experimental-strip-types", join(repoRoot, "scripts", "smoke.ts")], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 3000_000,
    maxBuffer: 200 * 1024 * 1024,
  });
  assert.equal(r.status, 0, `smoke failed (exit ${r.status}):\n${r.stdout}\n${r.stderr}`);
});
