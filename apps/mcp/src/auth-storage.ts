import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const STORAGE_FILE_NAME = "mcp-auth.json";

export type StoredMcpAuthState = {
  version: 1;
  clientId: string;
  redirectUri: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
};

function getConfigRoot() {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME?.trim();

  if (xdgConfigHome) {
    return path.join(xdgConfigHome, "adluv");
  }

  return path.join(os.homedir(), ".config", "adluv");
}

export function getMcpAuthStoragePath() {
  return path.join(getConfigRoot(), STORAGE_FILE_NAME);
}

export async function readStoredMcpAuthState(): Promise<StoredMcpAuthState | null> {
  try {
    const raw = await readFile(getMcpAuthStoragePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<StoredMcpAuthState> | null;

    if (
      !parsed ||
      parsed.version !== 1 ||
      typeof parsed.clientId !== "string" ||
      typeof parsed.redirectUri !== "string" ||
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.accessTokenExpiresAt !== "string"
    ) {
      return null;
    }

    return parsed as StoredMcpAuthState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function writeStoredMcpAuthState(state: StoredMcpAuthState) {
  const storagePath = getMcpAuthStoragePath();
  await mkdir(path.dirname(storagePath), { recursive: true });
  await writeFile(storagePath, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export async function clearStoredMcpAuthState() {
  try {
    await rm(getMcpAuthStoragePath(), { force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}
