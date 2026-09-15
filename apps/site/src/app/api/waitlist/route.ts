import { NextResponse } from "next/server";

import {
  getBrevoWaitlistConfig,
  getDiscordWaitlistWebhookUrl,
  isValidWaitlistEmail,
  normalizeWaitlistEmail,
} from "../../../lib/waitlist";

const WAITLIST_UNAVAILABLE_MESSAGE = "Waitlist signups are temporarily unavailable.";
const WAITLIST_SUBMISSION_ERROR_MESSAGE = "Unable to join the waitlist right now.";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? normalizeWaitlistEmail(body.email) : "";

  if (!isValidWaitlistEmail(email)) {
    return NextResponse.json(
      {
        message: "Enter a valid email address.",
      },
      { status: 400 },
    );
  }

  const brevo = getBrevoWaitlistConfig();
  const discordWebhookUrl = getDiscordWaitlistWebhookUrl();

  if (!brevo) {
    console.error("[waitlist] Missing Brevo waitlist configuration.");

    return NextResponse.json(
      {
        message: WAITLIST_UNAVAILABLE_MESSAGE,
      },
      { status: 503 },
    );
  }

  let response: Response;

  try {
    response = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "api-key": brevo.apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        email,
        listIds: [brevo.listId],
        updateEnabled: true,
      }),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[waitlist] Failed to reach Brevo.", error);

    return NextResponse.json(
      {
        message: WAITLIST_SUBMISSION_ERROR_MESSAGE,
      },
      { status: 502 },
    );
  }

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as
      | { message?: string; code?: string }
      | null;

    console.error("[waitlist] Brevo rejected waitlist signup.", {
      status: response.status,
      code: errorPayload?.code,
      message: errorPayload?.message,
    });

    return NextResponse.json(
      {
        message: WAITLIST_SUBMISSION_ERROR_MESSAGE,
      },
      { status: 502 },
    );
  }

  if (!discordWebhookUrl) {
    console.warn("[waitlist] Waitlist signup stored in Brevo without Discord mirror.");
  } else {
    try {
      const discordResponse = await fetch(discordWebhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          content: `New waitlist signup: ${email}`,
        }),
        cache: "no-store",
      });

      if (!discordResponse.ok) {
        const errorText = await discordResponse.text().catch(() => "");

        console.error("[waitlist] Discord webhook rejected waitlist notification.", {
          status: discordResponse.status,
          body: errorText || null,
        });
      }
    } catch (error) {
      console.error("[waitlist] Failed to reach Discord webhook.", error);
    }
  }

  return NextResponse.json({
    ok: true,
    email,
  });
}
