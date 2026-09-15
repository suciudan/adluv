import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveCdnAssetUrl } from "@adluv/config";
import sharp from "sharp";

import { uploadStoredObject } from "./b2";
import { resolveCdnStoragePath } from "./paths";

const screenshotsDirectory = resolveCdnStoragePath("landing-page-screenshots");
const publicScreenshotPrefix = "/landing-page-screenshots/";
const viewport = {
  width: 1440,
  height: 1100,
};

function buildHash(input: Buffer | string) {
  return createHash("sha1").update(input).digest("hex");
}

function buildPublicScreenshotUrl(pathname: string) {
  return resolveCdnAssetUrl(pathname) ?? pathname;
}

export async function captureLandingPageScreenshot(url: string) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage({
      viewport,
      deviceScaleFactor: 1,
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36",
    });

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);

    const screenshot = await page.screenshot({
      animations: "disabled",
      fullPage: false,
      type: "png",
    });
    const webp = await sharp(screenshot).webp({ quality: 82 }).toBuffer();
    const filename = `${buildHash(url).slice(0, 16)}-${buildHash(webp).slice(0, 16)}.webp`;
    const pathname = `${publicScreenshotPrefix}${filename}`;
    const localPath = path.join(screenshotsDirectory, filename);

    await mkdir(screenshotsDirectory, { recursive: true });
    await writeFile(localPath, webp);
    await uploadStoredObject({
      pathname,
      body: webp,
      contentType: "image/webp",
      metadata: {
        width: String(viewport.width),
        height: String(viewport.height),
      },
    });

    return buildPublicScreenshotUrl(pathname);
  } finally {
    await browser.close();
  }
}
