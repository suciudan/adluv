import { spawn } from "node:child_process";
import fs from "node:fs/promises";

import { ensureTmpDir, getE2eDatabaseUrl, getRepoRoot, getWorkerPidFile, resetE2eState } from "./helpers/state";

async function waitForWorkerReady(worker: ReturnType<typeof spawn>) {
  const timeoutMs = 30_000;
  const start = Date.now();

  return new Promise<void>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const interval = setInterval(() => {
      if (Date.now() - start < timeoutMs || settled) {
        return;
      }

      fail(new Error(`Timed out waiting for worker readiness.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
    }, 250);

    const cleanup = () => {
      clearInterval(interval);
      worker.stdout?.removeAllListeners();
      worker.stderr?.removeAllListeners();
      worker.removeAllListeners();
    };

    const fail = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(error);
    };

    worker.on("exit", (code, signal) => {
      fail(new Error(`Worker exited before becoming ready (code=${code ?? "null"} signal=${signal ?? "null"}).\n${stderr}`));
    });

    worker.stdout?.on("data", (chunk) => {
      stdout += String(chunk);

      if (stdout.includes("worker started") || stdout.includes("\"event\":\"worker.started\"")) {
        settled = true;
        cleanup();
        resolve();
      }
    });

    worker.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });

  });
}

export default async function globalSetup() {
  await ensureTmpDir();
  await resetE2eState();
  const databaseUrl = getE2eDatabaseUrl();

  const worker = spawn("yarn", ["workspace", "@adluv/worker", "dev"], {
    cwd: getRepoRoot(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      E2E_DATABASE_URL: databaseUrl,
      adluv_E2E_FIXTURE_MODE: "1",
      adluv_FAKE_RESEND: "1",
      SYNC_CADENCE_MINUTES: "0.01",
      SYNC_SCHEDULER_POLL_SECONDS: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await waitForWorkerReady(worker);
  await fs.writeFile(getWorkerPidFile(), String(worker.pid), "utf8");
}
