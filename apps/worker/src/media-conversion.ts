import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const imageWebpQuality = 82;
const videoCrf = 23;
const videoAudioBitrate = "96k";
const videoScaleFilter =
  "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))':flags=lanczos";

export type MediaDimensions = {
  width: number;
  height: number;
  aspectRatio: number;
};

function createMediaDimensions(width: number | null | undefined, height: number | null | undefined) {
  if (!width || !height || width <= 0 || height <= 0) {
    return null;
  }

  return {
    width,
    height,
    aspectRatio: Number((width / height).toFixed(4)),
  } satisfies MediaDimensions;
}

function isVideoExtension(extension: string | null) {
  return extension === ".mp4" || extension === ".mov" || extension === ".webm";
}

function parseVideoDimensionsFromFfmpegOutput(output: string) {
  const match = output.match(/Video:.*?(\d{2,5})x(\d{2,5})(?:[,\s\[])/s);

  if (!match) {
    return null;
  }

  return createMediaDimensions(Number.parseInt(match[1] ?? "", 10), Number.parseInt(match[2] ?? "", 10));
}

async function probeVideoDimensions(filePath: string) {
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static is not available.");
  }

  try {
    const { stderr } = await execFileAsync(
      ffmpegPath,
      ["-hide_banner", "-i", filePath, "-map", "0:v:0", "-frames:v", "1", "-f", "null", "-"],
      { maxBuffer: 16 * 1024 * 1024 },
    );

    return parseVideoDimensionsFromFfmpegOutput(stderr);
  } catch (error) {
    const details =
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      typeof (error as { stderr?: unknown }).stderr === "string"
        ? (error as { stderr: string }).stderr
        : "";

    const dimensions = parseVideoDimensionsFromFfmpegOutput(details);

    if (dimensions) {
      return dimensions;
    }

    throw error;
  }
}

export async function getStoredMediaDimensions(filePath: string, contentType?: string | null) {
  const extension = path.extname(filePath).toLowerCase() || null;
  const normalizedContentType = contentType?.split(";")[0]?.trim().toLowerCase();

  if (normalizedContentType?.startsWith("video/") || isVideoExtension(extension)) {
    return probeVideoDimensions(filePath);
  }

  const metadata = await sharp(filePath, {
    animated: extension === ".gif" || extension === ".webp",
    limitInputPixels: false,
  })
    .rotate()
    .metadata();

  return createMediaDimensions(metadata.width, metadata.height);
}

export async function getBufferMediaDimensions(buffer: Buffer, extension: string | null, contentType?: string | null) {
  const normalizedContentType = contentType?.split(";")[0]?.trim().toLowerCase();

  if (normalizedContentType?.startsWith("video/") || isVideoExtension(extension)) {
    const tempDirectory = await mkdtemp(path.join(tmpdir(), "adluv-video-dimensions-"));
    const inputPath = path.join(tempDirectory, `input${extension ?? ".bin"}`);

    try {
      await writeFile(inputPath, buffer);
      return await probeVideoDimensions(inputPath);
    } finally {
      await rm(tempDirectory, { force: true, recursive: true });
    }
  }

  const metadata = await sharp(buffer, {
    animated: extension === ".gif" || extension === ".webp",
    limitInputPixels: false,
  })
    .rotate()
    .metadata();

  return createMediaDimensions(metadata.width, metadata.height);
}

export async function convertImageBufferToWebp(buffer: Buffer, extension: string | null) {
  return sharp(buffer, {
    animated: extension === ".gif",
    limitInputPixels: false,
  })
    .rotate()
    .webp({
      effort: 4,
      quality: imageWebpQuality,
    })
    .toBuffer();
}

export async function compressVideoBufferToMp4(buffer: Buffer, extension: string | null) {
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static is not available.");
  }

  const tempDirectory = await mkdtemp(path.join(tmpdir(), "adluv-video-"));
  const inputPath = path.join(tempDirectory, `input${extension ?? ".bin"}`);
  const outputPath = path.join(tempDirectory, "output.mp4");

  try {
    await writeFile(inputPath, buffer);

    await execFileAsync(
      ffmpegPath,
      [
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-vf",
        videoScaleFilter,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        String(videoCrf),
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-c:a",
        "aac",
        "-b:a",
        videoAudioBitrate,
        "-ac",
        "2",
        outputPath,
      ],
      {
        maxBuffer: 16 * 1024 * 1024,
      },
    );

    const outputBuffer = await readFile(outputPath);

    if (!outputBuffer.length) {
      throw new Error("Video compression produced an empty body.");
    }

    return outputBuffer;
  } catch (error) {
    const details =
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      typeof (error as { stderr?: unknown }).stderr === "string"
        ? (error as { stderr: string }).stderr.trim()
        : "";

    if (details) {
      throw new Error(`Video compression failed: ${details}`);
    }

    throw error;
  } finally {
    await rm(tempDirectory, { force: true, recursive: true });
  }
}
