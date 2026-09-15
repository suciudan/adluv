import type { SourceAdapter, SourceName } from "./types";
import { createLinkedInAdapter, type CreateLinkedInAdapterOptions } from "./linkedin/index";
import { createMetaAdapter, type CreateMetaAdapterOptions } from "./meta/index";
import { createGoogleAdapter, type CreateGoogleAdapterOptions } from "./google/index";

export type CreateSourceAdapterOptions = CreateLinkedInAdapterOptions & CreateMetaAdapterOptions & CreateGoogleAdapterOptions;

export function createSourceAdapter(source: SourceName, options?: CreateSourceAdapterOptions): SourceAdapter {
  if (source === "linkedin") {
    return createLinkedInAdapter(options);
  }

  if (source === "facebook") {
    return createMetaAdapter({
      ...options,
      metaTransportOrder: "proxy-first",
      webScrapingApiCountry: undefined,
      webScrapingApiKey: undefined,
      webScrapingApiProxy: undefined,
    });
  }

  if (source === "google") {
    return createGoogleAdapter(options);
  }

  throw new Error(`No source adapter is configured for ${source}.`);
}
