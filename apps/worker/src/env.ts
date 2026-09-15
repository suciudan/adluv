import { loadWorkspaceEnv } from "@adluv/config/load-env";
import { validateStartupEnvironment } from "@adluv/config/startup";

loadWorkspaceEnv();
validateStartupEnvironment("worker");

function getPositiveNumberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);

  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return value;
}

export function getWorkerEnv() {
  return {
    resendFrom: process.env.RESEND_FROM ?? "alerts@example.com",
    resendApiKey: process.env.RESEND_API_KEY,
    syncCadenceMinutes: getPositiveNumberEnv("SYNC_CADENCE_MINUTES", 12 * 60),
    syncSchedulerPollSeconds: getPositiveNumberEnv("SYNC_SCHEDULER_POLL_SECONDS", 60),
    activeAdStatusCheckCadenceHours: getPositiveNumberEnv("ACTIVE_AD_STATUS_CHECK_CADENCE_HOURS", 24),
    creativeAssetRepairScanLimit: getPositiveNumberEnv("CREATIVE_ASSET_REPAIR_SCAN_LIMIT", 50),
  };
}
