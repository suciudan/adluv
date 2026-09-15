import {
  listPendingAlertDigestItems,
  markAlertDigestDelivered,
} from "@adluv/db";
import { getAuthUserById } from "@adluv/auth";
import { appConfig, getAppOrigin, getSourceLabel, type SourceName } from "@adluv/config";

import { getWorkerEnv } from "../env";
import { logWorkerEvent, toErrorContext } from "../logger";

export type SendAlertDigestPayload = {
  userId: string;
  digestFrequency: "daily" | "weekly" | "monthly";
};

async function sendEmail(input: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  if (process.env.adluv_FAKE_RESEND === "1") {
    return {
      providerMessageId: `fake-digest-${Buffer.from(`${input.to}:${input.subject}`).toString("hex").slice(0, 24)}`,
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend request failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as { id?: string };

  return {
    providerMessageId: payload.id,
  };
}

type PendingDigestItems = Awaited<ReturnType<typeof listPendingAlertDigestItems>>;
type DigestFrequency = SendAlertDigestPayload["digestFrequency"];

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatSource(source: string) {
  return getSourceLabel(source as SourceName);
}

function formatFrequencyLabel(frequency: DigestFrequency) {
  if (frequency === "monthly") {
    return "monthly";
  }

  if (frequency === "weekly") {
    return "weekly";
  }

  return "daily";
}

function formatDigestDateRange(items: PendingDigestItems) {
  const sortedTimes = items
    .map((item) => item.createdAt.getTime())
    .filter((time) => Number.isFinite(time))
    .sort((left, right) => left - right);

  if (!sortedTimes.length) {
    return "";
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const first = formatter.format(new Date(sortedTimes[0]));
  const last = formatter.format(new Date(sortedTimes[sortedTimes.length - 1]));

  return first === last ? first : `${first} - ${last}`;
}

function groupDigestItems(items: PendingDigestItems) {
  const groups = new Map<
    string,
    {
      advertiserId: string;
      advertiserName: string;
      sources: Set<string>;
      items: PendingDigestItems;
    }
  >();

  for (const item of items) {
    const key = `${item.advertiserId}:${item.advertiserName}`;
    const existing = groups.get(key);

    if (existing) {
      existing.sources.add(item.source);
      existing.items.push(item);
      continue;
    }

    groups.set(key, {
      advertiserId: item.advertiserId,
      advertiserName: item.advertiserName,
      sources: new Set([item.source]),
      items: [item],
    });
  }

  return [...groups.values()].sort((left, right) => {
    const countDelta = right.items.length - left.items.length;
    return countDelta || left.advertiserName.localeCompare(right.advertiserName);
  });
}

export function buildDigestEmail(input: {
  digestFrequency: DigestFrequency;
  items: PendingDigestItems;
  activityUrl: string;
}) {
  const advertiserGroups = groupDigestItems(input.items);
  const alertCount = input.items.length;
  const advertiserCount = advertiserGroups.length;
  const frequencyLabel = formatFrequencyLabel(input.digestFrequency);
  const dateRange = formatDigestDateRange(input.items);
  const subject = `${pluralize(advertiserCount, "advertiser")} ${advertiserCount === 1 ? "has" : "have"} new ads`;
  const title = `New Ads from Your Watchlist`;

  const textLines = [
    title,
    dateRange,
    `${pluralize(alertCount, "new ad")} from ${pluralize(advertiserCount, "advertiser")}.`,
    "",
    ...advertiserGroups.map((group) => {
      const sources = [...group.sources].map(formatSource).join(", ");
      return `${group.advertiserName}\n${sources} - ${pluralize(group.items.length, "new ad")}\n${input.activityUrl}`;
    }),
    "",
    `View all new ads: ${input.activityUrl}`,
    "",
    `You are receiving this ${frequencyLabel} digest because email notifications are enabled in ${appConfig.name}.`,
  ].filter((line) => line !== undefined);

  const groupRows = advertiserGroups
    .map((group) => {
      const sources = [...group.sources].map(formatSource).join(", ");
      const activityHref = `${input.activityUrl}?advertiser=${encodeURIComponent(group.advertiserId)}`;

      return `
        <tr>
          <td style="padding: 18px 20px; border: 1px solid #e5e7eb; border-radius: 8px; display: block;">
            <p style="margin: 0 0 12px; color: #111827; font: 700 16px/1.4 Arial, sans-serif;">${escapeHtml(group.advertiserName)}</p>
            <p style="margin: 0; color: #6b7280; font: 600 13px/1.6 Arial, sans-serif;">${escapeHtml(sources)} - ${escapeHtml(pluralize(group.items.length, "new ad"))}</p>
            <p style="margin: 12px 0 0; color: #6b7280; font: 400 13px/1.6 Arial, sans-serif;">
              <a href="${escapeHtml(activityHref)}" style="color: #6d28d9; text-decoration: none;">Review advertiser activity</a>
            </p>
          </td>
        </tr>
        <tr><td style="height: 14px; line-height: 14px;">&nbsp;</td></tr>
      `;
    })
    .join("");

  const html = `<!doctype html>
<html>
  <body style="margin: 0; padding: 0; background: #ffffff;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #ffffff;">
      <tr>
        <td align="center" style="padding: 48px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px;">
            <tr>
              <td align="center" style="padding-bottom: 34px;">
                <h1 style="margin: 0; color: #111827; font: 700 24px/1.3 Arial, sans-serif;">${escapeHtml(title)}</h1>
                ${dateRange ? `<p style="margin: 18px 0 0; color: #6b7280; font: 600 13px/1.5 Arial, sans-serif;">${escapeHtml(dateRange)}</p>` : ""}
              </td>
            </tr>
            <tr>
              <td>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="center" style="width: 50%; padding: 18px; background: #f9fafb; border-radius: 8px;">
                      <p style="margin: 0; color: #111827; font: 700 30px/1 Arial, sans-serif;">${alertCount}</p>
                      <p style="margin: 8px 0 0; color: #6b7280; font: 600 13px/1 Arial, sans-serif;">New Ads</p>
                    </td>
                    <td style="width: 16px;">&nbsp;</td>
                    <td align="center" style="width: 50%; padding: 18px; background: #f9fafb; border-radius: 8px;">
                      <p style="margin: 0; color: #111827; font: 700 30px/1 Arial, sans-serif;">${advertiserCount}</p>
                      <p style="margin: 8px 0 0; color: #6b7280; font: 600 13px/1 Arial, sans-serif;">Advertisers</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr><td style="height: 28px; line-height: 28px;">&nbsp;</td></tr>
            ${groupRows}
            <tr>
              <td align="center" style="padding-top: 18px;">
                <a href="${escapeHtml(input.activityUrl)}" style="display: inline-block; border-radius: 6px; background: #111827; color: #ffffff; font: 700 13px/1 Arial, sans-serif; padding: 14px 20px; text-decoration: none;">View All New Ads -&gt;</a>
                <p style="margin: 16px 0 0; color: #6b7280; font: 600 13px/1.5 Arial, sans-serif;">See complete activity feed</p>
              </td>
            </tr>
            <tr>
              <td style="padding-top: 48px;">
                <div style="border-top: 1px solid #e5e7eb; padding-top: 24px; text-align: center;">
                  <p style="margin: 0; color: #6b7280; font: 500 12px/1.6 Arial, sans-serif;">Sent by ${escapeHtml(appConfig.name)} as a ${escapeHtml(frequencyLabel)} digest.</p>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    subject,
    text: textLines.join("\n"),
    html,
  };
}

export async function runSendAlertDigestJob(payload: SendAlertDigestPayload) {
  const workerEnv = getWorkerEnv();
  logWorkerEvent("info", "alert_digest.started", payload);
  const recipient = await getAuthUserById(payload.userId, process.env);

  if (!recipient?.email) {
    throw new Error(`Auth user ${payload.userId} is missing an email address.`);
  }

  const items = await listPendingAlertDigestItems(payload.userId, 100);

  if (!items.length) {
    logWorkerEvent("info", "alert_digest.skipped", {
      userId: payload.userId,
      digestFrequency: payload.digestFrequency,
      reason: "no_pending_alerts",
    });

    return {
      payload,
      skipped: true,
      reason: "no_pending_alerts",
    };
  }

  if (!workerEnv.resendApiKey) {
    const errorMessage = "RESEND_API_KEY is not configured for digest delivery.";
    logWorkerEvent("error", "alert_digest.failed", {
      userId: payload.userId,
      digestFrequency: payload.digestFrequency,
      errorMessage,
    });
    throw new Error(errorMessage);
  }

  try {
    const digestEmail = buildDigestEmail({
      digestFrequency: payload.digestFrequency,
      items,
      activityUrl: `${getAppOrigin()}/activity`,
    });
    const delivery = await sendEmail({
      apiKey: workerEnv.resendApiKey,
      from: workerEnv.resendFrom,
      to: recipient.email,
      subject: digestEmail.subject,
      text: digestEmail.text,
      html: digestEmail.html,
    });

    await markAlertDigestDelivered(
      payload.userId,
      delivery.providerMessageId ?? `digest-${payload.userId}-${Date.now()}`,
      new Date(),
      items.map((item) => item.alertId),
    );

    logWorkerEvent("info", "alert_digest.completed", {
      userId: payload.userId,
      digestFrequency: payload.digestFrequency,
      alertsIncluded: items.length,
      providerMessageId: delivery.providerMessageId,
    });

    return {
      payload,
      alertsIncluded: items.length,
      delivered: true,
      providerMessageId: delivery.providerMessageId,
    };
  } catch (error) {
    logWorkerEvent("error", "alert_digest.failed", {
      userId: payload.userId,
      digestFrequency: payload.digestFrequency,
      ...toErrorContext(error),
    });
    throw error;
  }
}
