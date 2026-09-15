import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import { loadWorkspaceEnv } from "@adluv/config/load-env";
import { authenticateMcpAccessToken, type McpAuthRecord } from "@adluv/db";

import { readStoredMcpAuthState } from "./auth-storage";
import {
  loginWithBrowserFlow,
  logoutMcpOAuth,
  refreshStoredAccessToken,
  resolveBetterAuthUrl,
  resolveOAuthIssuerUrl,
  shouldRefreshAccessToken,
} from "./oauth";
import { getQueryLibraryHtml, getQueryLibraryResource, QUERY_LIBRARY_URI } from "./query-library";
import { callTool, listTools } from "./tools";

loadWorkspaceEnv();

const SUPPORTED_PROTOCOL_VERSION = "2024-11-05";
const MCP_ENDPOINT_PATH = "/mcp";
const HEALTH_ENDPOINT_PATH = "/healthz";
const PROTECTED_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";
const PROTECTED_RESOURCE_METADATA_MCP_PATH = `${PROTECTED_RESOURCE_METADATA_PATH}/mcp`;
const OAUTH_SCOPE = "openid profile email offline_access";
const DEFAULT_HTTP_HOST = "127.0.0.1";
const DEFAULT_HTTP_PORT = 3010;
const MAX_HTTP_BODY_BYTES = 1_048_576;

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

type JsonRpcEnvelope = {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};

type SessionCredential = {
  accessToken: string;
  source: "env" | "stored" | "param" | "header";
};

type HttpServerConfig = {
  host: string;
  port: number;
  baseUrl: string;
  endpointUrl: string;
  protectedResourceMetadataUrl: string;
  authorizationServerUrl: string;
  allowedOrigins: Set<string>;
  allowAllOrigins: boolean;
};

let receiveBuffer = Buffer.alloc(0);
let stdioSessionCredential: SessionCredential | null = null;

function readRecordField(record: unknown, key: string) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return undefined;
  }

  return (record as Record<string, unknown>)[key];
}

function normalizeBearerToken(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.toLowerCase().startsWith("bearer ")) {
    return trimmed.slice(7).trim() || null;
  }

  return trimmed;
}

function normalizeHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? undefined;
  }

  return value;
}

function extractAccessTokenFromCandidates(
  candidates: unknown[],
  source: SessionCredential["source"],
): SessionCredential | null {
  for (const candidate of candidates) {
    const normalized = normalizeBearerToken(candidate);

    if (normalized) {
      return {
        accessToken: normalized,
        source,
      };
    }
  }

  return null;
}

function extractAccessTokenFromParams(params?: Record<string, unknown>) {
  return extractAccessTokenFromCandidates(
    [
      readRecordField(params, "accessToken"),
      readRecordField(params, "authorizationToken"),
      readRecordField(params, "authorization"),
      readRecordField(readRecordField(params, "headers"), "authorization"),
    ],
    "param",
  );
}

function extractStdioAccessToken(params?: Record<string, unknown>) {
  return (
    extractAccessTokenFromCandidates(
      [process.env.ADLUV_MCP_ACCESS_TOKEN, process.env.MCP_ACCESS_TOKEN],
      "env",
    ) ?? extractAccessTokenFromParams(params)
  );
}

function extractHttpAccessToken(
  params: Record<string, unknown> | undefined,
  headers: IncomingHttpHeaders,
) {
  return (
    extractAccessTokenFromCandidates([normalizeHeaderValue(headers.authorization)], "header") ??
    extractAccessTokenFromParams(params)
  );
}

async function getStoredOAuthCredential(): Promise<SessionCredential | null> {
  const stored = await readStoredMcpAuthState();

  if (!stored) {
    return null;
  }

  try {
    const activeState = shouldRefreshAccessToken(stored)
      ? await refreshStoredAccessToken(stored)
      : stored;

    return {
      accessToken: activeState.accessToken,
      source: "stored",
    };
  } catch {
    return null;
  }
}

async function resolveStdioSessionCredential(params?: Record<string, unknown>) {
  return extractStdioAccessToken(params) ?? (await getStoredOAuthCredential());
}

async function authorizeWithCredential(credential: SessionCredential): Promise<McpAuthRecord> {
  let auth = await authenticateMcpAccessToken(credential.accessToken);

  if (!auth && credential.source === "stored") {
    const stored = await readStoredMcpAuthState();

    if (stored) {
      const refreshed = await refreshStoredAccessToken(stored).catch(() => null);

      if (refreshed) {
        const nextCredential: SessionCredential = {
          accessToken: refreshed.accessToken,
          source: "stored",
        };
        auth = await authenticateMcpAccessToken(nextCredential.accessToken);

        if (auth) {
          stdioSessionCredential = nextCredential;
          return auth;
        }
      }
    }
  }

  if (!auth) {
    throw new Error(
      credential.source === "stored"
        ? "Unauthorized. Your AdLuv MCP login has expired. Run `yarn workspace @adluv/mcp login`."
        : "Unauthorized. Provide a valid AdLuv MCP access token.",
    );
  }

  return auth;
}

function buildJsonRpcResult(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

function buildJsonRpcError(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

function buildInitializeResponse(id: JsonRpcId, auth: McpAuthRecord): JsonRpcResponse {
  return buildJsonRpcResult(id, {
    protocolVersion: SUPPORTED_PROTOCOL_VERSION,
    capabilities: {
      resources: {},
      tools: {},
    },
    serverInfo: {
      name: "adluv-mcp",
      version: "0.0.1",
    },
    instructions: `Authenticated as ${auth.userEmail}. All user-scoped queries will run as this AdLuv user.`,
  });
}

async function handleAuthorizedMethod(
  message: JsonRpcRequest,
  getAuth: () => Promise<McpAuthRecord>,
): Promise<JsonRpcResponse | null> {
  const id = message.id ?? null;

  if (message.method === "notifications/initialized") {
    return null;
  }

  if (message.method === "ping") {
    return buildJsonRpcResult(id, {});
  }

  if (message.method === "resources/list") {
    await getAuth();
    return buildJsonRpcResult(id, {
      resources: [getQueryLibraryResource()],
    });
  }

  if (message.method === "resources/read") {
    await getAuth();
    const uri = message.params?.uri;

    if (uri !== QUERY_LIBRARY_URI) {
      return buildJsonRpcError(id, -32602, `Unknown resource URI: ${String(uri)}`);
    }

    return buildJsonRpcResult(id, {
      contents: [
        {
          uri: QUERY_LIBRARY_URI,
          mimeType: "text/html",
          text: getQueryLibraryHtml(),
        },
      ],
    });
  }

  if (message.method === "tools/list") {
    await getAuth();
    return buildJsonRpcResult(id, {
      tools: listTools(),
    });
  }

  if (message.method === "tools/call") {
    const auth = await getAuth();
    const name = message.params?.name;
    const args = message.params?.arguments;

    if (typeof name !== "string") {
      return buildJsonRpcError(id, -32602, "Expected tools/call params.name to be a string.");
    }

    if (args != null && (typeof args !== "object" || Array.isArray(args))) {
      return buildJsonRpcError(id, -32602, "Expected tools/call params.arguments to be an object.");
    }

    const result = await callTool(name, (args as Record<string, unknown>) ?? {}, {
      auth,
    });

    return buildJsonRpcResult(id, result);
  }

  return buildJsonRpcError(id, -32601, `Method not found: ${message.method}`);
}

async function processStdioRpcMessage(message: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const id = message.id ?? null;

  if (message.method === "initialize") {
    const credential = await resolveStdioSessionCredential(message.params);

    if (!credential) {
      return buildJsonRpcError(
        id,
        -32001,
        "Unauthorized. Run `yarn workspace @adluv/mcp login` or set ADLUV_MCP_ACCESS_TOKEN before starting the MCP server.",
      );
    }

    const auth = await authorizeWithCredential(credential);
    stdioSessionCredential = credential;

    return buildInitializeResponse(id, auth);
  }

  return handleAuthorizedMethod(message, async () => {
    if (!stdioSessionCredential) {
      throw new Error("Unauthorized. Run `yarn workspace @adluv/mcp login` before starting the MCP server.");
    }

    return authorizeWithCredential(stdioSessionCredential);
  });
}

function sendStdioMessage(message: JsonRpcResponse | Record<string, unknown>) {
  const body = JSON.stringify(message);
  const contentLength = Buffer.byteLength(body, "utf8");
  process.stdout.write(`Content-Length: ${contentLength}\r\n\r\n${body}`);
}

function parsePort(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value?.trim() ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveUrlOrigin(candidate: string | undefined) {
  const trimmed = candidate?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function resolveHttpServerConfig(): HttpServerConfig {
  const host = process.env.MCP_HOST?.trim() || DEFAULT_HTTP_HOST;
  const port = parsePort(process.env.MCP_PORT, DEFAULT_HTTP_PORT);
  const configuredBaseUrl = process.env.MCP_BASE_URL?.trim();

  if (!configuredBaseUrl && process.env.NODE_ENV === "production") {
    throw new Error("MCP_BASE_URL must be configured in production so OAuth metadata advertises the public MCP URL.");
  }

  const baseUrl = configuredBaseUrl
    ? configuredBaseUrl.replace(/\/+$/, "")
    : `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`;
  const endpointUrl = `${baseUrl}${MCP_ENDPOINT_PATH}`;
  const protectedResourceMetadataUrl = `${baseUrl}${PROTECTED_RESOURCE_METADATA_MCP_PATH}`;
  const allowedOriginCandidates = [
    resolveUrlOrigin(baseUrl),
    resolveUrlOrigin(process.env.APP_URL),
    resolveUrlOrigin(process.env.SITE_URL),
    resolveUrlOrigin(process.env.BETTER_AUTH_URL),
    ...((process.env.MCP_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => (value === "*" ? "*" : resolveUrlOrigin(value)))),
  ];
  const allowAllOrigins = allowedOriginCandidates.includes("*");
  const allowedOrigins = new Set(
    allowedOriginCandidates.filter((value): value is string => Boolean(value) && value !== "*"),
  );

  return {
    host,
    port,
    baseUrl,
    endpointUrl,
    protectedResourceMetadataUrl,
    authorizationServerUrl: resolveOAuthIssuerUrl(),
    allowedOrigins,
    allowAllOrigins,
  };
}

function buildProtectedResourceMetadata(config: HttpServerConfig) {
  return {
    resource: config.endpointUrl,
    authorization_servers: [config.authorizationServerUrl],
    scopes_supported: OAUTH_SCOPE.split(" "),
    bearer_methods_supported: ["header"],
  };
}

function buildWwwAuthenticateHeader(config: HttpServerConfig) {
  return `Bearer realm="adluv-mcp", resource_metadata="${config.protectedResourceMetadataUrl}", scope="${OAUTH_SCOPE}"`;
}

function resolveOrigin(headers: IncomingHttpHeaders) {
  const value = normalizeHeaderValue(headers.origin);

  if (!value) {
    return {
      present: false,
      origin: null,
    };
  }

  try {
    return {
      present: true,
      origin: new URL(value).origin,
    };
  } catch {
    return {
      present: true,
      origin: null,
    };
  }
}

function buildCorsHeaders(origin: string | null, config: HttpServerConfig): Record<string, string> | null {
  if (!origin) {
    return {};
  }

  if (config.allowAllOrigins) {
    return {
      "access-control-allow-origin": origin,
      vary: "Origin",
    };
  }

  if (!config.allowedOrigins.has(origin)) {
    return null;
  }

  return {
    "access-control-allow-origin": origin,
    vary: "Origin",
  };
}

function mergeHeaders(...headerGroups: Array<Record<string, string> | null | undefined>) {
  const merged: Record<string, string> = {};

  for (const group of headerGroups) {
    if (!group) {
      continue;
    }

    for (const [key, value] of Object.entries(group)) {
      merged[key] = value;
    }
  }

  return merged;
}

function writeHttpHeaders(
  response: ServerResponse,
  headers: Record<string, string | number | undefined>,
) {
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }

    response.setHeader(key, value);
  }
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown, headers?: Record<string, string>) {
  const payload = JSON.stringify(body);
  response.statusCode = statusCode;
  writeHttpHeaders(response, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload, "utf8"),
    ...headers,
  });
  response.end(payload);
}

function sendNoContent(response: ServerResponse, statusCode: number, headers?: Record<string, string>) {
  response.statusCode = statusCode;
  writeHttpHeaders(response, headers ?? {});
  response.end();
}

async function readHttpJsonBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let totalBytes = 0;
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;

      if (totalBytes > MAX_HTTP_BODY_BYTES) {
        reject(new Error("Request body is too large."));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    request.on("error", reject);
  });
}

function isJsonRpcRequest(payload: JsonRpcEnvelope): payload is JsonRpcRequest {
  return payload.jsonrpc === "2.0" && typeof payload.method === "string";
}

async function processHttpRpcMessage(
  message: JsonRpcRequest,
  headers: IncomingHttpHeaders,
): Promise<{
  statusCode: number;
  body?: JsonRpcResponse;
  headers?: Record<string, string>;
}> {
  const id = message.id ?? null;

  if (message.method === "initialize") {
    const credential = extractHttpAccessToken(message.params, headers);

    if (!credential) {
      return {
        statusCode: 401,
        body: buildJsonRpcError(id, -32001, "Unauthorized. Provide a valid AdLuv MCP access token."),
      };
    }

    const auth = await authorizeWithCredential(credential);

    return {
      statusCode: 200,
      body: buildInitializeResponse(id, auth),
      headers: {
        "mcp-protocol-version": SUPPORTED_PROTOCOL_VERSION,
      },
    };
  }

  const response = await handleAuthorizedMethod(message, async () => {
    const credential = extractHttpAccessToken(message.params, headers);

    if (!credential) {
      throw new Error("Unauthorized. Provide a valid AdLuv MCP access token.");
    }

    return authorizeWithCredential(credential);
  });

  if (!response) {
    return {
      statusCode: 202,
      headers: {
        "mcp-protocol-version": SUPPORTED_PROTOCOL_VERSION,
      },
    };
  }

  return {
    statusCode: 200,
    body: response,
    headers: {
      "mcp-protocol-version": SUPPORTED_PROTOCOL_VERSION,
    },
  };
}

async function handleHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  config: HttpServerConfig,
) {
  const requestUrl = new URL(request.url ?? "/", config.baseUrl);
  const originResolution = resolveOrigin(request.headers);
  const corsHeaders = buildCorsHeaders(originResolution.origin, config);

  if (originResolution.present && (originResolution.origin == null || corsHeaders == null)) {
    sendJson(
      response,
      403,
      buildJsonRpcError(null, -32000, "Forbidden origin."),
      {
        "cache-control": "no-store",
      },
    );
    return;
  }

  const commonHeaders = mergeHeaders(corsHeaders ?? undefined, {
    "cache-control": "no-store",
  });

  if (request.method === "OPTIONS") {
    sendNoContent(
      response,
      204,
      mergeHeaders(commonHeaders, {
        "access-control-allow-headers": "authorization, content-type, accept, mcp-protocol-version",
        "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
        "access-control-max-age": "86400",
      }),
    );
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/") {
    sendJson(
      response,
      200,
      {
        name: "adluv-mcp",
        transport: "streamable-http",
        endpoint: config.endpointUrl,
        authorizationServer: config.authorizationServerUrl,
        protectedResourceMetadata: config.protectedResourceMetadataUrl,
        health: `${config.baseUrl}${HEALTH_ENDPOINT_PATH}`,
      },
      commonHeaders,
    );
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === HEALTH_ENDPOINT_PATH) {
    sendJson(
      response,
      200,
      {
        ok: true,
        service: "adluv-mcp",
      },
      commonHeaders,
    );
    return;
  }

  if (
    request.method === "GET" &&
    (requestUrl.pathname === PROTECTED_RESOURCE_METADATA_PATH ||
      requestUrl.pathname === PROTECTED_RESOURCE_METADATA_MCP_PATH)
  ) {
    sendJson(response, 200, buildProtectedResourceMetadata(config), commonHeaders);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === MCP_ENDPOINT_PATH) {
    sendJson(
      response,
      405,
      {
        error: "This MCP endpoint does not expose a standalone SSE stream. Use HTTP POST requests.",
      },
      mergeHeaders(commonHeaders, {
        allow: "POST, OPTIONS",
      }),
    );
    return;
  }

  if (request.method === "DELETE" && requestUrl.pathname === MCP_ENDPOINT_PATH) {
    sendJson(
      response,
      405,
      {
        error: "This MCP endpoint is stateless and does not support session deletion.",
      },
      mergeHeaders(commonHeaders, {
        allow: "POST, OPTIONS",
      }),
    );
    return;
  }

  if (request.method !== "POST" || requestUrl.pathname !== MCP_ENDPOINT_PATH) {
    sendJson(response, 404, { error: "Not found" }, commonHeaders);
    return;
  }

  try {
    const rawBody = await readHttpJsonBody(request);
    const parsedBody = JSON.parse(rawBody) as JsonRpcEnvelope;

    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      sendJson(response, 400, buildJsonRpcError(null, -32600, "Invalid JSON-RPC payload."), commonHeaders);
      return;
    }

    if (!isJsonRpcRequest(parsedBody)) {
      sendNoContent(response, 202, commonHeaders);
      return;
    }

    const rpcResult = await processHttpRpcMessage(parsedBody, request.headers);
    const statusHeaders = mergeHeaders(
      commonHeaders,
      rpcResult.statusCode === 401
        ? {
            "www-authenticate": buildWwwAuthenticateHeader(config),
          }
        : undefined,
      rpcResult.headers,
    );

    if (!rpcResult.body) {
      sendNoContent(response, rpcResult.statusCode, statusHeaders);
      return;
    }

    sendJson(response, rpcResult.statusCode, rpcResult.body, statusHeaders);
  } catch (error) {
    const statusCode =
      error instanceof SyntaxError
        ? 400
        : error instanceof Error && error.message === "Request body is too large."
          ? 413
          : error instanceof Error && error.message.startsWith("Unauthorized.")
            ? 401
            : 500;

    sendJson(
      response,
      statusCode,
      buildJsonRpcError(null, -32000, error instanceof Error ? error.message : "Unexpected MCP server failure."),
      mergeHeaders(
        commonHeaders,
        statusCode === 401
          ? {
              "www-authenticate": buildWwwAuthenticateHeader(config),
            }
          : undefined,
      ),
    );
  }
}

function processStdioBuffer() {
  while (true) {
    const headerEnd = receiveBuffer.indexOf("\r\n\r\n");

    if (headerEnd === -1) {
      return;
    }

    const header = receiveBuffer.subarray(0, headerEnd).toString("utf8");
    const contentLengthLine = header
      .split("\r\n")
      .find((line) => line.toLowerCase().startsWith("content-length:"));

    if (!contentLengthLine) {
      receiveBuffer = receiveBuffer.subarray(headerEnd + 4);
      continue;
    }

    const contentLength = Number.parseInt(contentLengthLine.split(":")[1]?.trim() ?? "", 10);

    if (!Number.isFinite(contentLength) || contentLength < 0) {
      receiveBuffer = receiveBuffer.subarray(headerEnd + 4);
      continue;
    }

    const messageStart = headerEnd + 4;
    const messageEnd = messageStart + contentLength;

    if (receiveBuffer.length < messageEnd) {
      return;
    }

    const body = receiveBuffer.subarray(messageStart, messageEnd).toString("utf8");
    receiveBuffer = receiveBuffer.subarray(messageEnd);

    try {
      const message = JSON.parse(body) as JsonRpcRequest;
      void processStdioRpcMessage(message)
        .then((response) => {
          if (response) {
            sendStdioMessage(response);
          }
        })
        .catch((error) => {
          sendStdioMessage(
            buildJsonRpcError(
              message.id ?? null,
              -32000,
              error instanceof Error ? error.message : "Unexpected server failure.",
            ),
          );
        });
    } catch (error) {
      sendStdioMessage(
        buildJsonRpcError(
          null,
          -32700,
          error instanceof Error ? error.message : "Failed to parse JSON-RPC message.",
        ),
      );
    }
  }
}

function startStdioServer() {
  process.stdin.on("data", (chunk: Buffer) => {
    receiveBuffer = Buffer.concat([receiveBuffer, chunk]);
    processStdioBuffer();
  });

  process.stdin.on("end", () => {
    process.exit(0);
  });
}

function startHttpServer() {
  const config = resolveHttpServerConfig();
  const server = createServer((request, response) => {
    void handleHttpRequest(request, response, config);
  });

  server.on("error", (error) => {
    const systemError = error as NodeJS.ErrnoException;

    if (systemError.code === "EADDRNOTAVAIL") {
      process.stderr.write(
        [
          `Unable to bind AdLuv MCP to ${config.host}:${config.port}.`,
          "MCP_HOST must be a local bind address such as 127.0.0.1, 0.0.0.0, or a real interface IP on this machine.",
          `Use MCP_BASE_URL for the public hostname instead, for example ${config.baseUrl}.`,
        ].join("\n") + "\n",
      );
      process.exit(1);
    }

    if (systemError.code === "EADDRINUSE") {
      process.stderr.write(`Port ${config.port} is already in use for AdLuv MCP.\n`);
      process.exit(1);
    }

    throw error;
  });

  server.listen(config.port, config.host, () => {
    process.stderr.write(
      `AdLuv MCP listening on ${config.endpointUrl} (bind ${config.host}:${config.port})\n`,
    );
  });
}

async function runCommand(command?: string) {
  if (command === "login") {
    await loginWithBrowserFlow();
    process.stderr.write("AdLuv MCP login complete.\n");
    return;
  }

  if (command === "logout") {
    await logoutMcpOAuth();
    process.stderr.write("AdLuv MCP login cleared.\n");
    return;
  }

  if (command === "serve") {
    startHttpServer();
    return;
  }

  startStdioServer();
}

void runCommand(process.argv[2]).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Unexpected MCP failure."}\n`);
  process.exit(1);
});
