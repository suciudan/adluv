import { loadWorkspaceEnv } from "@adluv/config/load-env";

loadWorkspaceEnv();

export function envString(name: string, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

export function envInteger(name: string, fallback: number) {
  const value = Number(process.env[name]);

  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

export function splitEnvList(value: string | undefined, fallback: string[]) {
  const items = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return items?.length ? items : fallback;
}

export function normalizeEnvKey(value: string) {
  return value.trim().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toUpperCase();
}
