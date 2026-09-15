function coerceDate(value: Date | string | number | null | undefined) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resolvePersistedAdFirstSeenAt(input: {
  existingFirstSeenAt: Date | null | undefined;
  incomingFirstSeenAt: Date;
}) {
  const existingFirstSeenAt = coerceDate(input.existingFirstSeenAt);
  const incomingFirstSeenAt = coerceDate(input.incomingFirstSeenAt);

  if (!incomingFirstSeenAt) {
    throw new Error("Incoming ad firstSeenAt must be a valid date.");
  }

  if (!existingFirstSeenAt) {
    return incomingFirstSeenAt;
  }

  return existingFirstSeenAt.getTime() <= incomingFirstSeenAt.getTime()
    ? existingFirstSeenAt
    : incomingFirstSeenAt;
}
