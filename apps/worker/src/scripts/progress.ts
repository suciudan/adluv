const defaultHeartbeatIntervalMs = 30_000;

type ScriptProgressLogger = ((message: string) => void) & {
  stop: () => void;
};

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function resolveHeartbeatIntervalMs(heartbeatIntervalMs?: number) {
  if (heartbeatIntervalMs && Number.isFinite(heartbeatIntervalMs) && heartbeatIntervalMs > 0) {
    return heartbeatIntervalMs;
  }

  const envValue = process.env.BACKFILL_HEARTBEAT_INTERVAL_MS;
  const parsedEnvValue = envValue ? Number.parseInt(envValue, 10) : null;

  return parsedEnvValue && Number.isFinite(parsedEnvValue) && parsedEnvValue > 0
    ? parsedEnvValue
    : defaultHeartbeatIntervalMs;
}

export function createScriptProgressLogger(scriptName: string, heartbeatIntervalMs?: number) {
  const resolvedHeartbeatIntervalMs = resolveHeartbeatIntervalMs(heartbeatIntervalMs);
  const startedAt = Date.now();
  let lastMessage = "started";
  let lastLoggedAt = startedAt;
  let stopped = false;

  const log = ((message: string) => {
    lastMessage = message;
    lastLoggedAt = Date.now();
    console.log(`[${scriptName}] ${message}`);
  }) as ScriptProgressLogger;

  const heartbeat = setInterval(() => {
    if (stopped) {
      return;
    }

    const now = Date.now();

    if (now - lastLoggedAt < resolvedHeartbeatIntervalMs) {
      return;
    }

    console.log(
      `[${scriptName}] still working; elapsed=${formatDuration(now - startedAt)}; last="${lastMessage}"`,
    );
    lastLoggedAt = now;
  }, resolvedHeartbeatIntervalMs);

  heartbeat.unref();

  log.stop = () => {
    stopped = true;
    clearInterval(heartbeat);
  };

  process.once("beforeExit", log.stop);

  return log;
}
