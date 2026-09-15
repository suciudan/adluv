import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

import {
  type StoredMcpAuthState,
  clearStoredMcpAuthState,
  writeStoredMcpAuthState,
} from "./auth-storage";

const CALLBACK_PATH = "/callback";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

type OAuthTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
};

type OAuthClientRegistrationResponse = {
  client_id: string;
};

type OAuthCallbackResult =
  | {
      code: string;
      state: string | null;
    }
  | {
      error: string;
      description: string | null;
    };

function toBase64Url(input: Buffer) {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createPkcePair() {
  const codeVerifier = toBase64Url(randomBytes(32));
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

  return {
    codeVerifier,
    codeChallenge,
  };
}

function openBrowser(url: string) {
  const candidates =
    process.platform === "darwin"
      ? [["open", url]]
      : process.platform === "win32"
        ? [["cmd", "/c", "start", "", url]]
        : [["xdg-open", url]];

  for (const [command, ...args] of candidates) {
    try {
      const child = spawn(command, args, {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

function resolveConfiguredUrl(...candidates: Array<string | undefined>) {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();

    if (!trimmed) {
      continue;
    }

    return trimmed;
  }

  return null;
}

export function resolveBetterAuthUrl() {
  const configuredUrl = resolveConfiguredUrl(
    process.env.BETTER_AUTH_URL,
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  );

  if (!configuredUrl) {
    throw new Error("BETTER_AUTH_URL or APP_URL must be configured before running MCP OAuth login.");
  }

  const url = new URL(configuredUrl);
  const pathname = url.pathname.replace(/\/+$/, "");

  if (!pathname || pathname === "/") {
    url.pathname = "/api/auth";
  }

  return url.toString().replace(/\/+$/, "");
}

export function resolveOAuthIssuerUrl() {
  const configuredUrl = resolveConfiguredUrl(
    process.env.BETTER_AUTH_URL,
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  );

  if (!configuredUrl) {
    throw new Error("BETTER_AUTH_URL or APP_URL must be configured before advertising MCP OAuth metadata.");
  }

  return new URL(configuredUrl).origin;
}

function buildEndpoint(authUrl: string, pathname: string) {
  return `${authUrl.replace(/\/+$/, "")}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

async function parseJsonResponse<T>(response: Response) {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error_description" in payload
        ? String((payload as Record<string, unknown>).error_description)
        : `OAuth request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return payload as T;
}

async function registerPublicClient(authUrl: string, redirectUri: string) {
  const response = await fetch(buildEndpoint(authUrl, "/mcp/register"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      client_name: "AdLuv Local MCP",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: [redirectUri],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });

  return parseJsonResponse<OAuthClientRegistrationResponse>(response);
}

async function exchangeAuthorizationCode(input: {
  authUrl: string;
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}) {
  const body = new URLSearchParams({
    client_id: input.clientId,
    code: input.code,
    code_verifier: input.codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri,
  });

  const response = await fetch(buildEndpoint(input.authUrl, "/mcp/token"), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  return parseJsonResponse<OAuthTokenResponse>(response);
}

export async function refreshStoredAccessToken(
  state: StoredMcpAuthState,
  authUrl = resolveBetterAuthUrl(),
) {
  const body = new URLSearchParams({
    client_id: state.clientId,
    grant_type: "refresh_token",
    refresh_token: state.refreshToken,
  });

  const response = await fetch(buildEndpoint(authUrl, "/mcp/token"), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const token = await parseJsonResponse<OAuthTokenResponse>(response);
  const nextState: StoredMcpAuthState = {
    ...state,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? state.refreshToken,
    accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
  };

  await writeStoredMcpAuthState(nextState);

  return nextState;
}

export function shouldRefreshAccessToken(state: StoredMcpAuthState) {
  const expiresAt = new Date(state.accessTokenExpiresAt);

  if (Number.isNaN(expiresAt.getTime())) {
    return true;
  }

  return expiresAt.getTime() - Date.now() <= ACCESS_TOKEN_REFRESH_BUFFER_MS;
}

async function startCallbackServer(timeoutMs = DEFAULT_TIMEOUT_MS) {
  let timeout: NodeJS.Timeout | null = null;

  const serverState = await new Promise<{
    redirectUri: string;
    result: Promise<OAuthCallbackResult>;
  }>((resolve, reject) => {
    const server = createServer((request, response) => {
      try {
        const requestUrl = new URL(request.url ?? "/", `http://127.0.0.1`);

        if (requestUrl.pathname !== CALLBACK_PATH) {
          response.statusCode = 404;
          response.end("Not found");
          return;
        }

        const error = requestUrl.searchParams.get("error");
        const description = requestUrl.searchParams.get("error_description");
        const code = requestUrl.searchParams.get("code");
        const state = requestUrl.searchParams.get("state");

        response.statusCode = 200;
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(
          error
            ? "<html><body><h1>AdLuv MCP login failed</h1><p>You can close this window.</p></body></html>"
            : "<html><body><h1>AdLuv MCP connected</h1><p>You can close this window.</p></body></html>",
        );

        server.close();

        if (timeout) {
          clearTimeout(timeout);
        }

        if (error) {
          callbackResolve({
            error,
            description,
          });
          return;
        }

        if (!code) {
          callbackReject(new Error("OAuth callback did not include an authorization code."));
          return;
        }

        callbackResolve({
          code,
          state,
        });
      } catch (error) {
        callbackReject(error);
      }
    });

    let callbackResolve!: (value: OAuthCallbackResult) => void;
    let callbackReject!: (error: unknown) => void;
    const result = new Promise<OAuthCallbackResult>((resolveResult, rejectResult) => {
      callbackResolve = resolveResult;
      callbackReject = rejectResult;
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        reject(new Error("Unable to determine the MCP OAuth callback port."));
        return;
      }

      timeout = setTimeout(() => {
        server.close();
        callbackReject(new Error("Timed out waiting for the browser login to complete."));
      }, timeoutMs);

      resolve({
        redirectUri: `http://127.0.0.1:${address.port}${CALLBACK_PATH}`,
        result,
      });
    });
  });

  return serverState;
}

export async function loginWithBrowserFlow() {
  const authUrl = resolveBetterAuthUrl();
  const callback = await startCallbackServer();
  const pkce = createPkcePair();
  const { client_id: clientId } = await registerPublicClient(authUrl, callback.redirectUri);
  const state = toBase64Url(randomBytes(16));
  const authorizeUrl = new URL(buildEndpoint(authUrl, "/mcp/authorize"));

  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("code_challenge", pkce.codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("redirect_uri", callback.redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "openid profile email offline_access");
  authorizeUrl.searchParams.set("state", state);

  const opened = openBrowser(authorizeUrl.toString());

  if (!opened) {
    process.stderr.write(`Open this URL to finish MCP login:\n${authorizeUrl.toString()}\n`);
  } else {
    process.stderr.write("Opening browser for AdLuv MCP login...\n");
  }

  const callbackResult = await callback.result;

  if ("error" in callbackResult) {
    throw new Error(callbackResult.description ?? callbackResult.error);
  }

  if (callbackResult.state !== state) {
    throw new Error("OAuth state verification failed.");
  }

  const token = await exchangeAuthorizationCode({
    authUrl,
    clientId,
    code: callbackResult.code,
    codeVerifier: pkce.codeVerifier,
    redirectUri: callback.redirectUri,
  });

  if (!token.refresh_token) {
    throw new Error("OAuth token response did not include a refresh token.");
  }

  const storedState: StoredMcpAuthState = {
    version: 1,
    clientId,
    redirectUri: callback.redirectUri,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
  };

  await writeStoredMcpAuthState(storedState);

  return storedState;
}

export async function logoutMcpOAuth() {
  await clearStoredMcpAuthState();
}
