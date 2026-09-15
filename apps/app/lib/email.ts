type TransactionalEmailInput = {
  to: string;
  subject: string;
  text: string;
};

export async function sendTransactionalEmail(input: TransactionalEmailInput) {
  const fakeResend = process.env.adluv_FAKE_RESEND === "1" || process.env.ADLUV_FAKE_RESEND === "1";

  if (fakeResend) {
    console.info("[email] fake send", {
      to: input.to,
      subject: input.subject,
    });

    return { id: "fake" };
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();

  if (!apiKey || !from) {
    throw new Error("Resend is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend request failed with status ${response.status}${body ? `: ${body}` : ""}`);
  }

  return response.json();
}
