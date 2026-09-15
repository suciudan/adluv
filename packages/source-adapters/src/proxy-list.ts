import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type ProxyListEntry = {
  label: string;
  url: string;
};

const proxyListDownloadCache = new Map<string, Promise<string[]>>();
const proxyListDownloadTimeoutMs = 15_000;

function findWorkspaceRoot(startDir = process.cwd()) {
  let currentDir = path.resolve(startDir);

  while (true) {
    if (existsSync(path.join(currentDir, "package.json")) && existsSync(path.join(currentDir, "apps")) && existsSync(path.join(currentDir, "packages"))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      return path.resolve(startDir, "../..");
    }

    currentDir = parentDir;
  }
}

function toProxyUrl(input: {
  host: string;
  password?: string;
  port?: string;
  protocol?: string;
  username?: string;
}) {
  const protocol = input.protocol ?? "http:";
  const url = new URL(`${protocol}//${input.host}${input.port ? `:${input.port}` : ""}`);

  if (input.username) {
    url.username = input.username;
  }

  if (input.password) {
    url.password = input.password;
  }

  return url.toString();
}

export function parseProxyListLine(line: string, index: number): ProxyListEntry | null {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  if (trimmed.includes("://")) {
    const url = new URL(trimmed);

    return {
      label: `proxy-${index + 1}`,
      url: toProxyUrl({
        host: url.hostname,
        password: decodeURIComponent(url.password),
        port: url.port,
        protocol: url.protocol,
        username: decodeURIComponent(url.username),
      }),
    };
  }

  const atMatch = trimmed.match(/^([^:@]+):([^@]+)@([^:]+):(\d+)$/);

  if (atMatch?.[1] && atMatch[2] && atMatch[3] && atMatch[4]) {
    return {
      label: `proxy-${index + 1}`,
      url: toProxyUrl({
        host: atMatch[3],
        password: atMatch[2],
        port: atMatch[4],
        username: atMatch[1],
      }),
    };
  }

  const parts = trimmed.split(":");

  if (parts.length >= 4) {
    const [host, port, username, ...passwordParts] = parts;
    const password = passwordParts.join(":");

    if (host && port && username && password) {
      return {
        label: `proxy-${index + 1}`,
        url: toProxyUrl({
          host,
          password,
          port,
          username,
        }),
      };
    }
  }

  throw new Error(`Unsupported proxy file line format at line ${index + 1}.`);
}

export function parseProxyList(value: string) {
  return value
    .split(/\r?\n/)
    .map(parseProxyListLine)
    .filter((entry): entry is ProxyListEntry => Boolean(entry));
}

function isProxyListDownloadUrl(value: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }

  return !url.username && !url.password && /\/proxy\/list\/download(?:\/|$)/.test(url.pathname);
}

async function fetchTextWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`Proxy list download failed with HTTP ${response.status}.`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function loadProxyUrlsFromDownloadUrl(url: string) {
  const cached = proxyListDownloadCache.get(url);

  if (cached) {
    return cached;
  }

  const promise = fetchTextWithTimeout(url, proxyListDownloadTimeoutMs).then((value) => parseProxyList(value).map((entry) => entry.url));
  proxyListDownloadCache.set(url, promise);

  try {
    return await promise;
  } catch (error) {
    proxyListDownloadCache.delete(url);
    throw error;
  }
}

function parseInlineProxyListFromEnv(value: string) {
  if (isProxyListDownloadUrl(value)) {
    return null;
  }

  return parseProxyList(value).map((entry) => entry.url);
}

function resolveProxyFilePath(filePath: string) {
  return path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(findWorkspaceRoot(), filePath);
}

function resolveProxyFileCandidates(filePath: string, env: NodeJS.ProcessEnv = process.env) {
  if (path.isAbsolute(filePath)) {
    return [path.resolve(filePath)];
  }

  const workspaceRoot = findWorkspaceRoot();
  const envDir = env.ADLUV_ENV_DIR?.trim();
  const candidates = [
    envDir ? path.resolve(workspaceRoot, envDir, filePath) : null,
    path.resolve(process.cwd(), filePath),
    path.resolve(workspaceRoot, filePath),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return [...new Set(candidates)];
}

export function loadProxyListFromFile(filePath: string, env: NodeJS.ProcessEnv = process.env) {
  const resolvedPath = resolveProxyFileCandidates(filePath, env).find((candidate) => existsSync(candidate)) ?? resolveProxyFilePath(filePath);

  if (!existsSync(resolvedPath)) {
    return [];
  }

  return parseProxyList(readFileSync(resolvedPath, "utf8"));
}

export function loadGoogleRpcProxyUrlsFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const inlineList = env.GOOGLE_RPC_PROXY_LIST?.trim();

  if (inlineList) {
    return parseProxyList(inlineList).map((entry) => entry.url);
  }

  const inlineUrls = (env.GOOGLE_RPC_PROXY_URLS ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  if (inlineUrls.length) {
    return inlineUrls;
  }

  const sharedInlineList = env.PROXIES_LIST?.trim();

  if (sharedInlineList) {
    const sharedProxyUrls = parseInlineProxyListFromEnv(sharedInlineList);

    if (sharedProxyUrls) {
      return sharedProxyUrls;
    }
  }

  const proxyFile = env.GOOGLE_RPC_PROXY_FILE?.trim() || env.PROXY_LAB_PROXY_FILE?.trim();
  const fileCandidates = [
    proxyFile,
    "apps/proxy-lab/Webshare 10 proxies.txt",
  ].filter((value): value is string => Boolean(value));

  for (const candidate of fileCandidates) {
    const entries = loadProxyListFromFile(candidate, env);

    if (entries.length) {
      return entries.map((entry) => entry.url);
    }
  }

  return [];
}

export function loadMetaProxyUrlsFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const inlineList = env.META_PROXY_LIST?.trim() || env.GOOGLE_RPC_PROXY_LIST?.trim();

  if (inlineList) {
    return parseProxyList(inlineList).map((entry) => entry.url);
  }

  const inlineUrls = (env.META_PROXY_URLS ?? env.GOOGLE_RPC_PROXY_URLS ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  if (inlineUrls.length) {
    return inlineUrls;
  }

  const sharedInlineList = env.PROXIES_LIST?.trim();

  if (sharedInlineList) {
    const sharedProxyUrls = parseInlineProxyListFromEnv(sharedInlineList);

    if (sharedProxyUrls) {
      return sharedProxyUrls;
    }
  }

  const proxyFile =
    env.META_PROXY_FILE?.trim() ||
    env.GOOGLE_RPC_PROXY_FILE?.trim() ||
    env.PROXY_LAB_PROXY_FILE?.trim();
  const fileCandidates = [
    proxyFile,
    "apps/proxy-lab/Webshare 10 proxies.txt",
  ].filter((value): value is string => Boolean(value));

  for (const candidate of fileCandidates) {
    const entries = loadProxyListFromFile(candidate, env);

    if (entries.length) {
      return entries.map((entry) => entry.url);
    }
  }

  return [];
}

export async function loadGoogleRpcProxyUrlsFromEnvAsync(env: NodeJS.ProcessEnv = process.env) {
  const inlineList = env.GOOGLE_RPC_PROXY_LIST?.trim();

  if (inlineList) {
    return parseProxyList(inlineList).map((entry) => entry.url);
  }

  const inlineUrls = (env.GOOGLE_RPC_PROXY_URLS ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  if (inlineUrls.length) {
    return inlineUrls;
  }

  const sharedList = env.PROXIES_LIST?.trim();

  if (sharedList) {
    return isProxyListDownloadUrl(sharedList)
      ? loadProxyUrlsFromDownloadUrl(sharedList)
      : parseProxyList(sharedList).map((entry) => entry.url);
  }

  return loadGoogleRpcProxyUrlsFromEnv(env);
}

export async function loadMetaProxyUrlsFromEnvAsync(env: NodeJS.ProcessEnv = process.env) {
  const inlineList = env.META_PROXY_LIST?.trim() || env.GOOGLE_RPC_PROXY_LIST?.trim();

  if (inlineList) {
    return parseProxyList(inlineList).map((entry) => entry.url);
  }

  const inlineUrls = (env.META_PROXY_URLS ?? env.GOOGLE_RPC_PROXY_URLS ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  if (inlineUrls.length) {
    return inlineUrls;
  }

  const sharedList = env.PROXIES_LIST?.trim();

  if (sharedList) {
    return isProxyListDownloadUrl(sharedList)
      ? loadProxyUrlsFromDownloadUrl(sharedList)
      : parseProxyList(sharedList).map((entry) => entry.url);
  }

  return loadMetaProxyUrlsFromEnv(env);
}
