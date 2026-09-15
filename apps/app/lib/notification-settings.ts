import type { UserNotificationSettingsSummary } from "@adluv/db";

export function formatDigestFrequencyLabel(frequency: UserNotificationSettingsSummary["digestFrequency"]) {
  if (frequency === "daily") {
    return "daily digest";
  }

  if (frequency === "weekly") {
    return "weekly digest";
  }

  if (frequency === "monthly") {
    return "monthly digest";
  }

  return "instant";
}

export function formatNotificationChannelLabel(settings: UserNotificationSettingsSummary) {
  const channels = [
    settings.emailEnabled ? formatDigestFrequencyLabel(settings.digestFrequency) : null,
    settings.inAppEnabled ? "in-app" : null,
  ].filter((value): value is string => Boolean(value));

  return channels.length ? channels.join(" + ") : "no channels selected";
}

export function formatNotificationStatusLabel(settings: UserNotificationSettingsSummary) {
  if (!settings.alertsPlanEnabled) {
    return "Notifications unavailable for this workspace";
  }

  if (!settings.alertsEnabled) {
    return "Notifications paused";
  }

  const activeChannels = [
    settings.emailImmediateDeliveryEnabled
      ? "email"
      : settings.emailDigestEnabled
        ? formatDigestFrequencyLabel(settings.digestFrequency)
        : null,
    settings.inAppDeliveryEnabled ? "in-app" : null,
  ].filter((value): value is string => Boolean(value));

  return activeChannels.length ? `Notifications: ${activeChannels.join(" + ")}` : "Notifications paused";
}
