import { createReadStream } from "node:fs";
import { access, mkdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const storageRoot = process.env.CDN_STORAGE_ROOT?.trim()
  ? path.resolve(process.env.CDN_STORAGE_ROOT.trim())
  : path.join(appRoot, "storage");
const hostname = process.env.CDN_HOST ?? "0.0.0.0";
const port = Number.parseInt(process.env.CDN_PORT ?? "3101", 10);

const contentTypes = new Map<string, string>([
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".json", "application/json; charset=utf-8"],
  [".mov", "video/quicktime"],
  [".mp4", "video/mp4"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webm", "video/webm"],
  [".webp", "image/webp"],
]);

function getContentType(filePath: string) {
  return contentTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
}

function toSafePathname(rawUrl: string) {
  const parsed = new URL(rawUrl, "http://localhost");
  const pathname = decodeURIComponent(parsed.pathname).replace(/^\/cdn(?=\/|$)/, "");
  const normalized = path.posix.normalize(pathname);

  if (!normalized.startsWith("/")) {
    return null;
  }

  if (normalized.includes("..")) {
    return null;
  }

  return normalized;
}

async function ensureStorageRoot() {
  await mkdir(storageRoot, { recursive: true });
}

const server = createServer(async (request, response) => {
  const pathname = toSafePathname(request.url ?? "/");

  if (!pathname) {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("Invalid path.");
    return;
  }

  if (pathname === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  const relativePath = pathname.replace(/^\/+/, "");
  const absolutePath = path.join(storageRoot, relativePath);
  const relativeToRoot = path.relative(storageRoot, absolutePath);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden.");
    return;
  }

  try {
    await access(absolutePath);

    const fileStat = await stat(absolutePath);

    if (!fileStat.isFile()) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found.");
      return;
    }

    response.writeHead(200, {
      "cache-control": "public, max-age=31536000, immutable",
      "content-length": fileStat.size,
      "content-type": getContentType(absolutePath),
    });

    createReadStream(absolutePath).pipe(response);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found.");
  }
});

await ensureStorageRoot();

server.listen(port, hostname, () => {
  console.log(`cdn listening on http://${hostname}:${port}`);
});
