import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { envInteger, envString, normalizeEnvKey, splitEnvList } from "./env";

export type ProxyProviderMode = "direct" | "http-proxy" | "webscrapingapi-proxy" | "webscrapingapi-rest";

export type ProxyProvider = {
  apiKey?: string;
  country?: string;
  label: string;
  mode: ProxyProviderMode;
  password?: string;
  sessionId?: string;
  timeoutMs: number;
  url?: string;
  username?: string;
};

function providerEnv(name: string, key: string) {
  return envString(`PROXY_PROVIDER_${normalizeEnvKey(name)}_${key}`);
}

function normalizeProviderMode(value: string, name: string): ProxyProviderMode {
  const normalized = value.trim().toLowerCase();

  if (normalized === "direct" || normalized === "http-proxy" || normalized === "webscrapingapi-proxy" || normalized === "webscrapingapi-rest") {
    return normalized;
  }

  if (name.toLowerCase() === "direct") {
    return "direct";
  }

  if (name.toLowerCase().includes("rest")) {
    return "webscrapingapi-rest";
  }

  if (name.toLowerCase().includes("webscrapingapi")) {
    return "webscrapingapi-proxy";
  }

  return "http-proxy";
}

function withScheme(value: string) {
  return value.includes("://") ? value : `http://${value}`;
}

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

function buildProvider(name: string): ProxyProvider {
  const mode = normalizeProviderMode(providerEnv(name, "MODE"), name);
  const timeoutMs = envInteger(`PROXY_PROVIDER_${normalizeEnvKey(name)}_TIMEOUT_MS`, envInteger("PROXY_LAB_TIMEOUT_MS", 30_000));
  const provider: ProxyProvider = {
    label: name,
    mode,
    timeoutMs,
  };

  if (mode === "direct") {
    return provider;
  }

  provider.url = providerEnv(name, "URL");
  provider.username = providerEnv(name, "USERNAME");
  provider.password = providerEnv(name, "PASSWORD");
  provider.country = providerEnv(name, "COUNTRY") || envString("PROXY_LAB_COUNTRY", "us");
  provider.sessionId = providerEnv(name, "SESSION_ID");
  provider.apiKey = providerEnv(name, "API_KEY");

  if (name.toLowerCase().startsWith("webscrapingapi")) {
    provider.url ||= envString("WEBSCRAPINGAPI_PROXY_URL");
    provider.username ||= envString("WEBSCRAPINGAPI_PROXY_USERNAME");
    provider.password ||= envString("WEBSCRAPINGAPI_PROXY_PASSWORD");
    provider.apiKey ||= envString("WEBSCRAPINGAPI_API_KEY");
  }

  return provider;
}

function getProxyFilePath(name: string) {
  const explicitPath = providerEnv(name, "FILE") || envString("PROXY_LAB_PROXY_FILE");
  const rootDir = findWorkspaceRoot();

  return explicitPath
    ? path.isAbsolute(explicitPath) ? path.resolve(explicitPath) : path.resolve(rootDir, explicitPath)
    : path.resolve(rootDir, "apps/proxy-lab/Webshare 10 proxies.txt");
}

function parseProxyFileLine(line: string) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  if (trimmed.includes("://")) {
    const url = new URL(trimmed);

    return {
      password: decodeURIComponent(url.password),
      url: `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}`,
      username: decodeURIComponent(url.username),
    };
  }

  const atMatch = trimmed.match(/^([^:@]+):([^@]+)@([^:]+):(\d+)$/);

  if (atMatch?.[1] && atMatch[2] && atMatch[3] && atMatch[4]) {
    return {
      password: atMatch[2],
      url: `http://${atMatch[3]}:${atMatch[4]}`,
      username: atMatch[1],
    };
  }

  const parts = trimmed.split(":");

  if (parts.length >= 4) {
    const [host, port, username, ...passwordParts] = parts;
    const password = passwordParts.join(":");

    if (host && port && username && password) {
      return {
        password,
        url: `http://${host}:${port}`,
        username,
      };
    }
  }

  throw new Error("Unsupported proxy file line format.");
}

function buildProxyFileProviders(name: string) {
  const filePath = getProxyFilePath(name);

  if (!existsSync(filePath)) {
    throw new Error(`Proxy file provider "${name}" could not find ${filePath}.`);
  }

  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map(parseProxyFileLine)
    .filter((proxy): proxy is NonNullable<ReturnType<typeof parseProxyFileLine>> => Boolean(proxy))
    .map((proxy, index): ProxyProvider => ({
      label: `${name}-${index + 1}`,
      mode: "http-proxy",
      password: proxy.password,
      timeoutMs: envInteger(`PROXY_PROVIDER_${normalizeEnvKey(name)}_TIMEOUT_MS`, envInteger("PROXY_LAB_TIMEOUT_MS", 30_000)),
      url: proxy.url,
      username: proxy.username,
    }));
}

function buildProvidersForName(name: string) {
  const normalized = name.trim().toLowerCase();

  if (normalized === "webshare" || normalized === "webshare-file" || normalized === "proxy-file") {
    return buildProxyFileProviders(name);
  }

  return [buildProvider(name)];
}

export function getProxyProviders() {
  const names = splitEnvList(process.env.PROXY_LAB_PROVIDERS, [envString("PROXY_LAB_PROVIDER", "direct")]);

  return names.flatMap(buildProvidersForName);
}

export function hasWebScrapingApiProxyConfig() {
  return Boolean(envString("WEBSCRAPINGAPI_PROXY_URL"));
}

export function getWebScrapingApiProxyProvider() {
  return buildProvider("webscrapingapi-proxy");
}

export function getProxyProvidersPreferWebScrapingApi() {
  if (process.env.PROXY_LAB_PROVIDER || process.env.PROXY_LAB_PROVIDERS) {
    return getProxyProviders();
  }

  return hasWebScrapingApiProxyConfig()
    ? [getWebScrapingApiProxyProvider()]
    : getProxyProviders();
}

export function getProxyUrl(provider: ProxyProvider) {
  if (provider.mode === "direct" || provider.mode === "webscrapingapi-rest") {
    return null;
  }

  const rawUrl = provider.url?.trim();

  if (!rawUrl) {
    const fallbackHint = provider.label.toLowerCase().startsWith("webscrapingapi")
      ? " or WEBSCRAPINGAPI_PROXY_URL"
      : "";

    throw new Error(`Proxy provider "${provider.label}" is missing PROXY_PROVIDER_${normalizeEnvKey(provider.label)}_URL${fallbackHint}.`);
  }

  const url = new URL(withScheme(rawUrl));

  if (url.username || url.password) {
    return url;
  }

  if (!provider.username || !provider.password) {
    throw new Error(`Proxy provider "${provider.label}" is missing username/password credentials.`);
  }

  if (provider.mode === "webscrapingapi-proxy") {
    const country = provider.country || "us";
    const baseUsername = provider.username.startsWith("username=")
      ? provider.username
      : `username=${provider.username}`;
    const countryUsername = baseUsername.includes("country=")
      ? baseUsername
      : `${baseUsername}+country=${country}`;

    url.username = provider.sessionId && !countryUsername.includes("session=")
      ? `${countryUsername}+session=${provider.sessionId}`
      : countryUsername;
  } else {
    url.username = provider.username;
  }

  url.password = provider.password;

  return url;
}
