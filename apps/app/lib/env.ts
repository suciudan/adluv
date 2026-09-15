import { loadWorkspaceEnv } from "@adluv/config/load-env";
import { getStartupValidationReport, validateStartupEnvironment } from "@adluv/config/startup";
import { getRuntimeStatus } from "./runtime-checks";

loadWorkspaceEnv();
validateStartupEnvironment("app");

export function getWebRuntimeFlags() {
  const report = getStartupValidationReport("app");

  return {
    authConfigured: !report.warnings.some((issue) => issue.label === "Better Auth"),
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    queueConfigured: Boolean(process.env.DATABASE_URL),
    emailConfigured: !report.warnings.some((warning) => warning.label === "Email delivery"),
  };
}

export async function getWebRuntimeStatus() {
  const flags = getWebRuntimeFlags();
  const runtime = await getRuntimeStatus();
  const validation = getStartupValidationReport("app");

  return {
    ...flags,
    databaseHealthy: runtime.database,
    queueHealthy: runtime.queue,
    startupErrors: validation.errors,
    startupWarnings: validation.warnings,
  };
}
