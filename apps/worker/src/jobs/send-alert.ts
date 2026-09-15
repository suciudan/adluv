import {
  getAlertDeliveryContext,
  getAlertEmailDeliveryStatus,
  getUserNotificationSettingsSummary,
  recordAlertEmailDelivered,
  recordAlertEmailFailed,
} from "@adluv/db";
import { getAuthUserById } from "@adluv/auth";
import { appConfig, getAppHref, getSourceLabel, type SourceName } from "@adluv/config";

import { getWorkerEnv } from "../env";
import { logWorkerEvent, toErrorContext } from "../logger";

export type SendAlertPayload = {
  alertId: string;
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
      providerMessageId: `fake-${Buffer.from(`${input.to}:${input.subject}`).toString("hex").slice(0, 24)}`,
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

function formatSource(source: string) {
  return getSourceLabel(source as SourceName);
}

function formatSeenDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(value);
}

export function buildAlertEmail(input: {
  headline: string;
  body: string | null;
  workspaceSlug: string;
  advertiserName: string;
  source: string;
  adId: string;
  adTitle: string | null;
  adBody: string | null;
  adFormat: string | null;
  adCallToAction: string | null;
  adMediaUrl: string | null;
  firstSeenAt: Date;
}) {
  const adUrl = getAppHref(`/w/${input.workspaceSlug}/ads/${input.adId}`);
  const activityUrl = getAppHref(`/w/${input.workspaceSlug}/activity`);
  const sourceLabel = formatSource(input.source);
  const primaryCopy = input.adTitle ?? input.body ?? input.adBody ?? "A newly observed creative was captured during the latest sync.";
  const secondaryCopy = input.adBody && input.adBody !== primaryCopy ? input.adBody : null;
  const metadata = [
    sourceLabel,
    input.adFormat,
    input.adCallToAction ? `CTA: ${input.adCallToAction}` : null,
    formatSeenDate(input.firstSeenAt),
  ].filter(Boolean);

  const text = [
    input.headline,
    "",
    `${input.advertiserName} has a new ${sourceLabel} ad.`,
    primaryCopy,
    secondaryCopy,
    "",
    `View ad: ${adUrl}`,
    `Open activity feed: ${activityUrl}`,
    "",
    `You are receiving this because email notifications are enabled in ${appConfig.name}.`,
  ].filter(Boolean).join("\n");

  const mediaBlock = input.adMediaUrl
    ? `
            <tr>
              <td style="padding: 0 32px 28px;">
                <img src="${escapeHtml(input.adMediaUrl)}" alt="" width="536" style="display: block; width: 100%; max-width: 536px; border: 1px solid #e5e7eb; border-radius: 8px;">
              </td>
            </tr>`
    : "";
  const secondaryBlock = secondaryCopy
    ? `<p style="margin: 14px 0 0; color: #4b5563; font: 400 14px/1.7 Arial, sans-serif;">${escapeHtml(truncateText(secondaryCopy, 260))}</p>`
    : "";

  const html = `<!doctype html>
<html>
  <body style="margin: 0; padding: 0; background: #f5f3ff;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #f5f3ff;">
      <tr>
        <td align="center" style="padding: 40px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
            <tr>
              <td style="padding: 28px 32px 22px; border-top: 5px solid #8b5cf6;">
                <p style="margin: 0 0 14px; color: #6d28d9; font: 700 12px/1.4 Arial, sans-serif; letter-spacing: 0.04em; text-transform: uppercase;">${escapeHtml(appConfig.name)} alert</p>
                <h1 style="margin: 0; color: #111827; font: 700 26px/1.25 Arial, sans-serif;">${escapeHtml(input.headline)}</h1>
                <p style="margin: 14px 0 0; color: #4b5563; font: 400 15px/1.7 Arial, sans-serif;">${escapeHtml(input.advertiserName)} launched a new ad. Open it in ${escapeHtml(appConfig.name)} to review the creative, destination, and activity context.</p>
              </td>
            </tr>
            ${mediaBlock}
            <tr>
              <td style="padding: 0 32px 30px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #ede9fe; border-radius: 8px; background: #fafafa;">
                  <tr>
                    <td style="padding: 20px;">
                      <p style="margin: 0 0 10px; color: #6d28d9; font: 700 13px/1.4 Arial, sans-serif;">${escapeHtml(metadata.join(" - "))}</p>
                      <p style="margin: 0; color: #111827; font: 700 17px/1.5 Arial, sans-serif;">${escapeHtml(truncateText(primaryCopy, 180))}</p>
                      ${secondaryBlock}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 32px 34px;">
                <a href="${escapeHtml(adUrl)}" style="display: inline-block; border-radius: 6px; background: #8b5cf6; color: #ffffff; font: 700 14px/1 Arial, sans-serif; padding: 14px 18px; text-decoration: none;">View ad</a>
                <a href="${escapeHtml(activityUrl)}" style="display: inline-block; margin-left: 12px; color: #6d28d9; font: 700 14px/1 Arial, sans-serif; text-decoration: none;">Open activity feed</a>
              </td>
            </tr>
            <tr>
              <td style="padding: 22px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb;">
                <p style="margin: 0; color: #6b7280; font: 500 12px/1.6 Arial, sans-serif;">Sent by ${escapeHtml(appConfig.name)} because instant email notifications are enabled.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    subject: input.headline,
    text,
    html,
  };
}

export async function runSendAlertJob(payload: SendAlertPayload) {
  const workerEnv = getWorkerEnv();
  logWorkerEvent("info", "alert_delivery.started", {
    alertId: payload.alertId,
  });

  const alert = await getAlertDeliveryContext(payload.alertId);

  if (!alert) {
    throw new Error(`Alert ${payload.alertId} was not found.`);
  }

  const recipient = await getAuthUserById(alert.userId, process.env);

  if (!recipient?.email) {
    throw new Error(`Auth user ${alert.userId} is missing an email address.`);
  }

  const existingDelivery = await getAlertEmailDeliveryStatus(payload.alertId);

  if (existingDelivery?.deliveredAt) {
    logWorkerEvent("info", "alert_delivery.skipped", {
      alertId: payload.alertId,
      reason: "already_delivered",
      deliveredAt: existingDelivery.deliveredAt.toISOString(),
    });

    return {
      payload,
      mode: "live",
      skipped: true,
      deliveredAt: existingDelivery.deliveredAt.toISOString(),
    };
  }

  const notificationSettings = await getUserNotificationSettingsSummary(alert.userId);

  if (!notificationSettings.emailImmediateDeliveryEnabled) {
    logWorkerEvent("warn", "alert_delivery.skipped", {
      alertId: payload.alertId,
      reason: "email_immediate_delivery_disabled",
    });

    return {
      payload,
      mode: "live",
      skipped: true,
      reason: "email_immediate_delivery_disabled",
    };
  }

  if (!workerEnv.resendApiKey) {
    const errorMessage = "RESEND_API_KEY is not configured for the worker runtime.";
    await recordAlertEmailFailed({
      alertId: payload.alertId,
      errorMessage,
    });
    logWorkerEvent("error", "alert_delivery.failed", {
      alertId: payload.alertId,
      email: recipient.email,
      errorMessage,
    });
    throw new Error(errorMessage);
  }

  try {
    const alertEmail = buildAlertEmail(alert);
    const delivery = await sendEmail({
      apiKey: workerEnv.resendApiKey,
      from: workerEnv.resendFrom,
      to: recipient.email,
      subject: alertEmail.subject,
      text: alertEmail.text,
      html: alertEmail.html,
    });

    await recordAlertEmailDelivered({
      alertId: payload.alertId,
      providerMessageId: delivery.providerMessageId,
    });

    logWorkerEvent("info", "alert_delivery.completed", {
      alertId: payload.alertId,
      email: recipient.email,
      providerMessageId: delivery.providerMessageId,
    });

    return {
      payload,
      from: workerEnv.resendFrom,
      mode: "live",
      delivered: true,
      providerMessageId: delivery.providerMessageId,
    };
  } catch (error) {
    await recordAlertEmailFailed({
      alertId: payload.alertId,
      errorMessage: error instanceof Error ? error.message : "Unknown email delivery failure.",
    });
    logWorkerEvent("error", "alert_delivery.failed", {
      alertId: payload.alertId,
      email: recipient.email,
      ...toErrorContext(error),
    });
    throw error;
  }
}
