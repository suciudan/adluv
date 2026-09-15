import assert from "node:assert/strict";
import test from "node:test";

import { getStartupValidationReport } from "./startup";

const envKeys = [
  "DATABASE_URL",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
  "CRISP_IDENTITY_VERIFICATION_SECRET",
  "RESEND_API_KEY",
  "RESEND_FROM",
  "WEBSCRAPINGAPI_API_KEY",
  "BREVO_API_KEY",
  "BREVO_WAITLIST_LIST_ID",
  "DISCORD_WAITLIST_WEBHOOK_URL",
  "DISCORD_ERROR_WEBHOOK_URL",
  "CDN_URL",
  "NEXT_PUBLIC_CDN_URL",
  "AD_ASSET_CDN_URL",
  "NEXT_PUBLIC_AD_ASSET_CDN_URL",
  "B2_ENDPOINT",
  "B2_BUCKET_NAME",
  "B2_APPLICATION_KEY_ID",
  "B2_APPLICATION_KEY",
] as const;

const baseEnv: Record<(typeof envKeys)[number], string> = {
  DATABASE_URL: "mysql://root:root@127.0.0.1:3306/adluv",
  BETTER_AUTH_URL: "https://app.adluv.test",
  BETTER_AUTH_SECRET: "secret",
  CRISP_IDENTITY_VERIFICATION_SECRET: "crisp_secret",
  RESEND_API_KEY: "resend_123",
  RESEND_FROM: "alerts@example.com",
  WEBSCRAPINGAPI_API_KEY: "wsapi_123",
  BREVO_API_KEY: "brevo_123",
  BREVO_WAITLIST_LIST_ID: "42",
  DISCORD_WAITLIST_WEBHOOK_URL: "https://discord.com/api/webhooks/test",
  DISCORD_ERROR_WEBHOOK_URL: "https://discord.com/api/webhooks/errors",
  CDN_URL: "https://cdn.adluv.test",
  NEXT_PUBLIC_CDN_URL: "https://cdn.adluv.test",
  AD_ASSET_CDN_URL: "https://ad-assets.adluv.test",
  NEXT_PUBLIC_AD_ASSET_CDN_URL: "https://ad-assets.adluv.test",
  B2_ENDPOINT: "https://s3.eu-central-003.backblazeb2.com",
  B2_BUCKET_NAME: "adluv-cdn",
  B2_APPLICATION_KEY_ID: "key_id",
  B2_APPLICATION_KEY: "secret",
};

function withEnv(
  overrides: Partial<Record<(typeof envKeys)[number], string>>,
  fn: () => void,
) {
  const previous = new Map<string, string | undefined>();

  for (const key of envKeys) {
    previous.set(key, process.env[key]);
    process.env[key] = overrides[key] ?? baseEnv[key];
  }

  try {
    fn();
  } finally {
    for (const key of envKeys) {
      const value = previous.get(key);

      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function labels(report: ReturnType<typeof getStartupValidationReport>) {
  return {
    errors: report.errors.map((issue) => issue.label),
    warnings: report.warnings.map((issue) => issue.label),
  };
}

test("app target treats missing email delivery config as a warning", () => {
  withEnv(
    {
      RESEND_API_KEY: "",
      RESEND_FROM: "",
    },
    () => {
      const report = getStartupValidationReport("app");

      assert.deepEqual(labels(report), {
        errors: [],
        warnings: ["Email delivery"],
      });
    },
  );
});

test("worker target treats missing B2 storage config as a warning", () => {
  withEnv(
    {
      B2_ENDPOINT: "",
      B2_BUCKET_NAME: "",
      B2_APPLICATION_KEY_ID: "",
      B2_APPLICATION_KEY: "",
    },
    () => {
      const report = getStartupValidationReport("worker");

      assert.deepEqual(labels(report), {
        errors: [],
        warnings: ["Ad asset object storage"],
      });
    },
  );
});

test("site target fails fast when Brevo waitlist signup config is missing", () => {
  withEnv(
    {
      BREVO_API_KEY: "",
      BREVO_WAITLIST_LIST_ID: "",
      DISCORD_WAITLIST_WEBHOOK_URL: "",
    },
    () => {
      const report = getStartupValidationReport("site");

      assert.deepEqual(labels(report), {
        errors: ["Waitlist signup"],
        warnings: ["Waitlist Discord mirror"],
      });
    },
  );
});

test("site target allows launches without the Discord mirror", () => {
  withEnv(
    {
      DISCORD_WAITLIST_WEBHOOK_URL: "",
    },
    () => {
      const report = getStartupValidationReport("site");

      assert.deepEqual(labels(report), {
        errors: [],
        warnings: ["Waitlist Discord mirror"],
      });
    },
  );
});
