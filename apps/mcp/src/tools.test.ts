import assert from "node:assert/strict";
import test from "node:test";

import { buildToolResponse, listTools, callTool } from "./tools";

function extractStructuredData(text: string) {
  const marker = "\n\nStructured data:\n";
  const markerIndex = text.indexOf(marker);

  assert.notEqual(markerIndex, -1);

  return JSON.parse(text.slice(markerIndex + marker.length)) as unknown;
}

test("tool responses expose structured payloads in both MCP fields and text content", () => {
  const structuredContent = {
    timeWindow: {
      preset: "last_90_days",
      since: "2026-02-14T00:00:00.000Z",
      until: "2026-05-15T00:00:00.000Z",
    },
    longestRunningAcrossAdvertisers: [
      {
        requestedAdvertiser: "puma",
        matchedAdvertiser: "Puma",
        adId: "ad_123",
        title: "Run faster",
        durationDays: 120,
      },
    ],
  };

  const response = buildToolResponse("Comparison data for 1 advertiser.", structuredContent);

  assert.deepEqual(response.structuredContent, structuredContent);
  assert.equal(response.isError, undefined);
  assert.equal(response.content.length, 1);
  assert.equal(response.content[0]?.type, "text");
  assert.match(response.content[0]?.text ?? "", /^Comparison data for 1 advertiser\./);

  assert.deepEqual(extractStructuredData(response.content[0]?.text ?? ""), structuredContent);
});

test("tool responses without structured payloads keep plain text content", () => {
  const response = buildToolResponse("No indexed advertiser record could be resolved.");

  assert.equal(response.structuredContent, undefined);
  assert.deepEqual(response.content, [
    {
      type: "text",
      text: "No indexed advertiser record could be resolved.",
    },
  ]);
});

test("MCP exposes expected advertiser and watchlist tools", () => {
  const toolNames = new Set(listTools().map((tool) => tool.name));

  assert.equal(toolNames.has("search_advertisers"), true);
  assert.equal(toolNames.has("search_library"), true);
  assert.equal(toolNames.has("get_advertiser_intelligence"), true);
  assert.equal(toolNames.has("analyze_advertiser_creatives"), true);
  assert.equal(toolNames.has("compare_advertisers"), true);
  assert.equal(toolNames.has("get_watchlist_report"), true);
});

test("unknown MCP tool calls fail before any handler work is attempted", async () => {
  await assert.rejects(
    () =>
      callTool("missing_tool", {}, {
        auth: {
          userId: "user_1",
          userEmail: "admin@adluv.local",
          userUsername: "admin",
          userName: "Default Admin",
        },
      }),
    /Unknown tool: missing_tool/,
  );
});
