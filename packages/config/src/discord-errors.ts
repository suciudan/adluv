export type DiscordErrorNotificationInput = {
  service: "adluv-app" | "adluv-worker" | "adluv-site";
  event: string;
  title: string;
  error: unknown;
  context?: Record<string, unknown>;
};

const maxContentLength = 1900;
const maxFieldLength = 1000;

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function getDiscordErrorWebhookUrl() {
  const value = process.env.DISCORD_ERROR_WEBHOOK_URL?.trim();

  return value || null;
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (typeof error === "string") {
    return {
      name: "Error",
      message: error,
      stack: undefined,
    };
  }

  return {
    name: "Error",
    message: "Unknown error",
    stack: undefined,
  };
}

function stringifyContext(context: Record<string, unknown> | undefined) {
  if (!context) {
    return null;
  }

  return JSON.stringify(context, (_key, value) => {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }

    if (typeof value === "bigint") {
      return value.toString();
    }

    return value;
  });
}

export async function postDiscordErrorNotification(input: DiscordErrorNotificationInput) {
  const webhookUrl = getDiscordErrorWebhookUrl();

  if (!webhookUrl) {
    return;
  }

  const error = normalizeError(input.error);
  const context = stringifyContext(input.context);
  const description = [`**Event:** ${input.event}`, `**Error:** ${error.message}`].join("\n");

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        content: truncate(`[${input.service}] ${input.title}`, maxContentLength),
        embeds: [
          {
            title: truncate(input.title, 256),
            description: truncate(description, 4096),
            color: 0xef4444,
            timestamp: new Date().toISOString(),
            fields: [
              {
                name: "Service",
                value: input.service,
                inline: true,
              },
              {
                name: "Error type",
                value: truncate(error.name, maxFieldLength),
                inline: true,
              },
              ...(context
                ? [
                    {
                      name: "Context",
                      value: `\`\`\`json\n${truncate(context, maxFieldLength - 12)}\n\`\`\``,
                    },
                  ]
                : []),
              ...(error.stack
                ? [
                    {
                      name: "Stack",
                      value: `\`\`\`\n${truncate(error.stack, maxFieldLength - 8)}\n\`\`\``,
                    },
                  ]
                : []),
            ],
          },
        ],
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");

      console.error("[discord-error-notification] webhook rejected notification", {
        status: response.status,
        body: body || null,
      });
    }
  } catch (notificationError) {
    console.error("[discord-error-notification] failed to post notification", notificationError);
  }
}
