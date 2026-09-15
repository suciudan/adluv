import { readFileSync } from "node:fs";
import path from "node:path";

export const QUERY_LIBRARY_URI = "adluv://query-library";

function findWorkspaceRoot(startDir = process.cwd()) {
  let current = path.resolve(startDir);

  while (true) {
    const candidate = path.join(current, "docs", "adluv_mcp_query_library.html");

    try {
      readFileSync(candidate, "utf8");
      return current;
    } catch {
      // Keep walking upward until the filesystem root.
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("Unable to locate docs/adluv_mcp_query_library.html from the current working directory.");
    }

    current = parent;
  }
}

export function getQueryLibraryHtml() {
  const workspaceRoot = findWorkspaceRoot();
  return readFileSync(path.join(workspaceRoot, "docs", "adluv_mcp_query_library.html"), "utf8");
}

export function getQueryLibraryResource() {
  return {
    uri: QUERY_LIBRARY_URI,
    name: "AdLuv MCP Query Library",
    description:
      "Persona-based query coverage for the AdLuv MCP server, including which prompts are covered by current AdLuv data.",
    mimeType: "text/html",
  };
}
