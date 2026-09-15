import path from "node:path";
import { fileURLToPath } from "node:url";

const workerRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

export function resolveWorkerPath(...segments: string[]) {
  return path.resolve(workerRoot, ...segments);
}

export function resolveRepoPath(...segments: string[]) {
  return path.resolve(repoRoot, ...segments);
}

export function resolveCdnStoragePath(...segments: string[]) {
  const configuredRoot = process.env.CDN_STORAGE_ROOT?.trim();

  if (configuredRoot) {
    return path.resolve(configuredRoot, ...segments);
  }

  return resolveRepoPath("apps", "cdn", "storage", ...segments);
}
