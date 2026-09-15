import fs from "node:fs/promises";

import { getWorkerPidFile } from "./helpers/state";

export default async function globalTeardown() {
  try {
    const rawPid = await fs.readFile(getWorkerPidFile(), "utf8");
    const pid = Number(rawPid.trim());

    if (Number.isFinite(pid) && pid > 0) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // Ignore cases where the worker already exited.
      }
    }
  } catch {
    return;
  } finally {
    await fs.rm(getWorkerPidFile(), { force: true });
  }
}
