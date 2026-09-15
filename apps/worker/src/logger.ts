type WorkerLogLevel = "info" | "warn" | "error";

function serializeError(error: unknown) {
  if (!(error instanceof Error)) {
    return error;
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

export function logWorkerEvent(level: WorkerLogLevel, event: string, data?: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "adluv-worker",
    event,
    ...(data ?? {}),
  };

  const line = JSON.stringify(entry, (_key, value) => {
    if (value instanceof Error) {
      return serializeError(value);
    }

    return value;
  });

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export function toErrorContext(error: unknown) {
  return {
    error: serializeError(error),
  };
}
