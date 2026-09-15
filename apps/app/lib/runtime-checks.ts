import { loadWorkspaceEnv } from "@adluv/config/load-env";
import { pingDatabase } from "@adluv/db";

loadWorkspaceEnv();

export async function getRuntimeStatus() {
  const status = {
    database: false,
    queue: false,
  };

  try {
    await pingDatabase();
    status.database = true;
    status.queue = true;
  } catch {
    status.database = false;
    status.queue = false;
  }

  return status;
}
