const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeWaitlistEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidWaitlistEmail(email: string) {
  return EMAIL_PATTERN.test(normalizeWaitlistEmail(email));
}

export function getBrevoWaitlistConfig() {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const listIdRaw = process.env.BREVO_WAITLIST_LIST_ID?.trim();
  const listId = Number(listIdRaw);

  if (!apiKey || !listIdRaw || !Number.isInteger(listId) || listId <= 0) {
    return null;
  }

  return {
    apiKey,
    listId,
  };
}

export function getDiscordWaitlistWebhookUrl() {
  const webhookUrl = process.env.DISCORD_WAITLIST_WEBHOOK_URL?.trim();

  if (!webhookUrl) {
    return null;
  }

  return webhookUrl;
}
