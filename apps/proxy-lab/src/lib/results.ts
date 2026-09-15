import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { envString } from "./env";
import type { ProxyProvider } from "./providers";

export type ProbeResult = {
  detail?: string;
  durationMs: number;
  error?: string;
  ok: boolean;
  provider: string;
  status?: number;
  target: string;
};

export async function runProbe(
  provider: ProxyProvider,
  target: string,
  probe: () => Promise<{ detail?: string; ok: boolean; status?: number }>,
): Promise<ProbeResult> {
  const startedAt = performance.now();

  try {
    const result = await probe();

    return {
      ...result,
      durationMs: Math.round(performance.now() - startedAt),
      provider: provider.label,
      target,
    };
  } catch (error) {
    return {
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
      ok: false,
      provider: provider.label,
      target,
    };
  }
}

export function printResults(results: ProbeResult[]) {
  for (const result of results) {
    const status = result.status ? ` http=${result.status}` : "";
    const detail = result.detail ? ` ${result.detail}` : "";
    const error = result.error ? ` error="${result.error.replace(/"/g, "'")}"` : "";

    console.log(`${result.ok ? "PASS" : "FAIL"} provider=${result.provider} target=${result.target}${status} duration=${result.durationMs}ms${detail}${error}`);
  }
}

export function summarizeResults(results: ProbeResult[]) {
  const passed = results.filter((result) => result.ok).length;
  const failed = results.length - passed;

  console.log(`summary passed=${passed} failed=${failed} total=${results.length}`);
}

export function writeJsonlReport(results: ProbeResult[]) {
  const outputPath = envString("PROXY_LAB_OUTPUT");

  if (!outputPath) {
    return;
  }

  const resolvedPath = path.resolve(outputPath);
  mkdirSync(path.dirname(resolvedPath), { recursive: true });

  for (const result of results) {
    appendFileSync(resolvedPath, `${JSON.stringify({ ...result, at: new Date().toISOString() })}\n`);
  }

  console.log(`report=${resolvedPath}`);
}
