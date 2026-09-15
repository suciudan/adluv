import type { NormalizedAd } from "@adluv/source-adapters";

const transcriptionModel = "whisper-1";
const maxTranscriptionBytes = 25 * 1024 * 1024;

function readMetadataString(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getVideoUrl(ad: NormalizedAd) {
  const format = ad.format?.toLowerCase() ?? "";
  const metadata = ad.metadata;

  return (
    readMetadataString(metadata, "assetVideoStoredUrl") ??
    readMetadataString(metadata, "sourceVideoUrl") ??
    (format.includes("video") ? ad.mediaUrl ?? null : null)
  );
}

async function transcribeVideoUrl(url: string, apiKey: string) {
  const mediaResponse = await fetch(url);

  if (!mediaResponse.ok) {
    return null;
  }

  const contentLength = Number(mediaResponse.headers.get("content-length") ?? 0);

  if (contentLength > maxTranscriptionBytes) {
    return null;
  }

  const mediaBuffer = Buffer.from(await mediaResponse.arrayBuffer());

  if (!mediaBuffer.byteLength || mediaBuffer.byteLength > maxTranscriptionBytes) {
    return null;
  }

  const formData = new FormData();
  formData.append("model", transcriptionModel);
  formData.append("file", new Blob([mediaBuffer], { type: mediaResponse.headers.get("content-type") ?? "video/mp4" }), "creative.mp4");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  return typeof payload.text === "string" && payload.text.trim() ? payload.text.trim() : null;
}

export async function prepareVideoTranscriptsForPersistence(ads: NormalizedAd[]) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return {
      ads,
      transcribed: 0,
    };
  }

  let transcribed = 0;
  const preparedAds: NormalizedAd[] = [];

  for (const ad of ads) {
    if (typeof ad.metadata?.transcript === "string" && ad.metadata.transcript.trim()) {
      preparedAds.push(ad);
      continue;
    }

    const videoUrl = getVideoUrl(ad);

    if (!videoUrl) {
      preparedAds.push(ad);
      continue;
    }

    const transcript = await transcribeVideoUrl(videoUrl, apiKey);

    if (!transcript) {
      preparedAds.push(ad);
      continue;
    }

    transcribed += 1;
    preparedAds.push({
      ...ad,
      metadata: {
        ...ad.metadata,
        transcript,
        transcriptModel: transcriptionModel,
        transcribedAt: new Date().toISOString(),
      },
    });
  }

  return {
    ads: preparedAds,
    transcribed,
  };
}
