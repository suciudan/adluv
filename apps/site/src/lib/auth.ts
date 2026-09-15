import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { mcp } from "better-auth/plugins";

import { getAppHref } from "@adluv/config";
import { loadWorkspaceEnv } from "@adluv/config/load-env";
import {
  authAccountsTable,
  authOauthAccessTokensTable,
  authOauthApplicationsTable,
  authOauthConsentsTable,
  authSessionsTable,
  authUsersTable,
  authVerificationsTable,
  getDb,
} from "@adluv/db";

loadWorkspaceEnv();

const appLoginHref = getAppHref("/login");

function collectTrustedOrigins() {
  const values = [
    process.env.BETTER_AUTH_URL,
    process.env.APP_URL,
    process.env.SITE_URL,
    process.env.CMS_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_CMS_URL,
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
  ];

  return [...new Set(
    values
      .map((value) => {
        if (!value) {
          return null;
        }

        try {
          return new URL(value).origin;
        } catch {
          return null;
        }
      })
      .filter((value): value is string => Boolean(value)),
  )];
}

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), {
    provider: "mysql",
    schema: {
      user: authUsersTable,
      session: authSessionsTable,
      account: authAccountsTable,
      verification: authVerificationsTable,
      oauthApplication: authOauthApplicationsTable,
      oauthAccessToken: authOauthAccessTokensTable,
      oauthConsent: authOauthConsentsTable,
    },
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: collectTrustedOrigins(),
  experimental: {
    joins: true,
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  user: {
    additionalFields: {
      username: {
        type: "string",
        required: false,
      },
      displayUsername: {
        type: "string",
        required: false,
      },
    },
  },
  plugins: [
    nextCookies(),
    mcp({
      loginPage: appLoginHref,
      oidcConfig: {
        loginPage: appLoginHref,
        requirePKCE: true,
        allowPlainCodeChallengeMethod: false,
      },
    }),
  ],
});
