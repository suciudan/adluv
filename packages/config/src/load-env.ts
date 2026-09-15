import { existsSync } from "node:fs";
import path from "node:path";

import { config as loadDotEnv } from "dotenv";

let loaded = false;

const workspaceEnvDirByPackageName = new Map<string, string>([
  ["@adluv/app", "apps/app"],
  ["@adluv/cdn", "apps/cdn"],
  ["@adluv/cms", "apps/cms"],
  ["@adluv/mcp", "apps/mcp"],
  ["@adluv/proxy-lab", "apps/proxy-lab"],
  ["@adluv/site", "apps/site"],
  ["@adluv/worker", "apps/worker"],
]);

function findWorkspaceRoot(startDir: string) {
  let currentDir = path.resolve(startDir);

  while (true) {
    if (
      existsSync(path.join(currentDir, "package.json")) &&
      existsSync(path.join(currentDir, "apps")) &&
      existsSync(path.join(currentDir, "packages"))
    ) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      return path.resolve(startDir, "../..");
    }

    currentDir = parentDir;
  }
}

function normalizeEnvDir(rootDir: string, envDir: string | undefined) {
  if (!envDir?.trim()) {
    return null;
  }

  return path.isAbsolute(envDir) ? path.resolve(envDir) : path.resolve(rootDir, envDir);
}

function dedupePaths(paths: string[]) {
  const uniquePaths = new Set<string>();

  for (const candidatePath of paths) {
    uniquePaths.add(path.resolve(candidatePath));
  }

  return [...uniquePaths];
}

function getWorkspaceEnvDirectories() {
  const cwd = process.cwd();
  const rootDir = findWorkspaceRoot(cwd);
  const relativeCwd = path.relative(rootDir, cwd);
  const [topLevelDir] = relativeCwd.split(path.sep);

  const explicitEnvDir = normalizeEnvDir(rootDir, process.env.ADLUV_ENV_DIR);
  const packageEnvDir = normalizeEnvDir(
    rootDir,
    workspaceEnvDirByPackageName.get(process.env.npm_package_name?.trim() ?? ""),
  );
  const shouldLoadAllAppDirs = !explicitEnvDir && !packageEnvDir && topLevelDir !== "apps";

  return {
    rootDir,
    envDirs: dedupePaths([
      ...(explicitEnvDir ? [explicitEnvDir] : []),
      ...(packageEnvDir ? [packageEnvDir] : []),
      cwd,
      ...(shouldLoadAllAppDirs ? [...workspaceEnvDirByPackageName.values()].map((envDir) => path.join(rootDir, envDir)) : []),
      rootDir,
    ]),
  };
}

export function loadWorkspaceEnv() {
  if (loaded) {
    return;
  }

  const { envDirs } = getWorkspaceEnvDirectories();

  for (const envDir of envDirs) {
    loadDotEnv({ path: path.join(envDir, ".env.local"), override: false, quiet: true });
    loadDotEnv({ path: path.join(envDir, ".env"), override: false, quiet: true });
  }

  loaded = true;
}
