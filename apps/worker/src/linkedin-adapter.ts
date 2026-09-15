import { createLinkedInAdapter } from "@adluv/source-adapters";

export async function createWorkerLinkedInAdapter() {
  return createLinkedInAdapter({
    webScrapingApiKey: process.env.WEBSCRAPINGAPI_API_KEY?.trim() || undefined,
  });
}
