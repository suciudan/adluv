import assert from "node:assert/strict";
import test from "node:test";

import { extractMetaAdLibraryDetailsFromRenderedHtml, normalizeMetaAdLibraryDetails } from "./index";

const repeatedCardImageUrl = "https://scontent.example.com/repeated-card-image.jpg";

test("normalizeMetaAdLibraryDetails preserves repeated-image Meta carousel card slots", () => {
  const ad = normalizeMetaAdLibraryDetails({
    ad_archive_id: "878314294537471",
    is_active: true,
    page_id: "110666381554597",
    snapshot: {
      cards: [
        {
          original_image_url: repeatedCardImageUrl,
          title: "Global scale. Local control.",
        },
        {
          original_image_url: repeatedCardImageUrl,
          title: "Global scale. Local control.",
        },
        {
          original_image_url: repeatedCardImageUrl,
          title: "Global scale. Local control.",
        },
      ],
      display_format: "DCO",
    },
    start_date: 1_716_249_600,
  });

  assert.ok(ad);
  const metadata = ad.metadata as Record<string, unknown>;
  const metaCreativeAssets = metadata.metaCreativeAssets as Array<Record<string, unknown>>;

  assert.equal(metaCreativeAssets.length, 3);
  assert.deepEqual(
    metaCreativeAssets.map((asset) => asset.label),
    ["Original", "Variant 1", "Variant 2"],
  );
  assert.deepEqual(
    metaCreativeAssets.map((asset) => asset.sourceMediaUrl),
    [repeatedCardImageUrl, repeatedCardImageUrl, repeatedCardImageUrl],
  );
});

test("extractMetaAdLibraryDetailsFromRenderedHtml finds a target ad in rendered Meta boot payloads", () => {
  const html = `
    <html>
      <body>
        <script type="application/json">
          {
            "require": [
              [
                "RelayPrefetchedStreamCache",
                "next",
                null,
                [
                  {
                    "__bbox": {
                      "result": {
                        "data": {
                          "ad_library_main": {
                            "search_results_connection": {
                              "edges": [
                                {
                                  "node": {
                                    "collated_results": [
                                      {
                                        "ad_archive_id": "1111111111",
                                        "page_id": "9999999999",
                                        "snapshot": { "cards": [] }
                                      },
                                      {
                                        "ad_archive_id": "878314294537471",
                                        "page_id": "110666381554597",
                                        "snapshot": {
                                          "cards": [
                                            {
                                              "title": "Pay Chinese suppliers",
                                              "original_image_url": "https://scontent.example.com/fresh.jpg"
                                            }
                                          ]
                                        }
                                      }
                                    ]
                                  }
                                }
                              ]
                            }
                          }
                        }
                      }
                    }
                  }
                ]
              ]
            ]
          }
        </script>
      </body>
    </html>
  `;
  const details = extractMetaAdLibraryDetailsFromRenderedHtml(html, "878314294537471", "110666381554597");

  assert.equal(details?.ad_archive_id, "878314294537471");
  assert.equal((details?.snapshot as { cards?: unknown[] }).cards?.length, 1);
});
