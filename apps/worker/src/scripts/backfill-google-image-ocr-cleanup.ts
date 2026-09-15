import { getPool } from "@adluv/db";
import type { RowDataPacket } from "mysql2/promise";
import { createScriptProgressLogger } from "./progress";

type Args = {
  adId: string | null;
  dryRun: boolean;
  limit: number | null;
};

type AdRow = RowDataPacket & {
  id: string;
  title: string | null;
  body: string | null;
  format: string | null;
  googleFormatCode: string | null;
  metadata: unknown;
};

type OcrMetadata = {
  titleCandidate?: unknown;
  bodyCandidate?: unknown;
  extractedText?: unknown;
};

type Stats = {
  scanned: number;
  updated: number;
  clearedTitle: number;
  clearedBody: number;
  removedOcr: number;
  fixedFormat: number;
  restoredTextFormat: number;
};

const logProgress = createScriptProgressLogger("backfill:google-image-ocr-cleanup");

function parseArgs(argv: string[]): Args {
  const adIdFlag = argv.find((value) => value.startsWith("--ad-id="));
  const limitFlag = argv.find((value) => value.startsWith("--limit="));
  const rawLimit = limitFlag ? Number.parseInt(limitFlag.slice("--limit=".length), 10) : null;
  const adId = adIdFlag?.slice("--ad-id=".length).trim() || null;

  return {
    adId,
    dryRun: argv.includes("--dry-run"),
    limit: adId ? 1 : Number.isFinite(rawLimit) && rawLimit && rawLimit > 0 ? rawLimit : null,
  };
}

function parseMetadata(value: unknown) {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }

  return {};
}

function getGoogleFormatCode(metadata: Record<string, unknown>) {
  const rawPayload = metadata.rawPayload && typeof metadata.rawPayload === "object" && !Array.isArray(metadata.rawPayload)
    ? (metadata.rawPayload as Record<string, unknown>)
    : null;

  return normalizeNullableString(
    typeof metadata.googleFormatCode === "string" || typeof metadata.googleFormatCode === "number"
      ? String(metadata.googleFormatCode)
      : typeof rawPayload?.["4"] === "string" || typeof rawPayload?.["4"] === "number"
        ? String(rawPayload["4"])
        : null,
  );
}

function normalizeNullableString(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

function normalizeForComparison(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().toLowerCase() : "";
}

function getOcrMetadata(metadata: Record<string, unknown>): OcrMetadata | null {
  return metadata.ocr && typeof metadata.ocr === "object" && !Array.isArray(metadata.ocr)
    ? (metadata.ocr as OcrMetadata)
    : null;
}

function shouldClearOcrCopy(value: string | null, candidate: unknown) {
  const normalizedValue = normalizeForComparison(value);
  const normalizedCandidate = normalizeForComparison(candidate);

  return Boolean(normalizedValue && normalizedCandidate && normalizedValue === normalizedCandidate);
}

function getOcrCandidate(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pool = getPool();
  const stats: Stats = {
    scanned: 0,
    updated: 0,
    clearedTitle: 0,
    clearedBody: 0,
    removedOcr: 0,
    fixedFormat: 0,
    restoredTextFormat: 0,
  };

  try {
    const limitClause = args.limit ? `limit ${args.limit}` : "";
    const [rows] = await pool.query<AdRow[]>(
      `
        select
          id,
          title,
          body,
          format,
          coalesce(
            json_unquote(json_extract(metadata, '$.googleFormatCode')),
            json_unquote(json_extract(metadata, '$.rawPayload."4"'))
          ) as googleFormatCode,
          metadata
        from ads
        where source = 'google'
          and (? is null or id = ?)
          and (
            coalesce(
              json_unquote(json_extract(metadata, '$.googleFormatCode')),
              json_unquote(json_extract(metadata, '$.rawPayload."4"'))
            ) = '2'
            or (
              coalesce(
                json_unquote(json_extract(metadata, '$.googleFormatCode')),
                json_unquote(json_extract(metadata, '$.rawPayload."4"'))
              ) = '1'
              and coalesce(lower(format), '') = 'image'
            )
            or (
              coalesce(
                json_unquote(json_extract(metadata, '$.googleFormatCode')),
                json_unquote(json_extract(metadata, '$.rawPayload."4"'))
              ) is null
              and coalesce(lower(format), '') = 'image'
            )
          )
          and (
            json_extract(metadata, '$.ocr') is not null
            or coalesce(lower(format), '') <> 'image'
            or coalesce(
              json_unquote(json_extract(metadata, '$.googleFormatCode')),
              json_unquote(json_extract(metadata, '$.rawPayload."4"'))
            ) = '1'
          )
        order by updated_at desc
        ${limitClause}
      `,
      [args.adId, args.adId],
    );

    stats.scanned = rows.length;
    logProgress(`found ${rows.length} google image ad${rows.length === 1 ? "" : "s"} to clean${args.dryRun ? " (dry run)" : ""}`);

    for (const row of rows) {
      const metadata = parseMetadata(row.metadata);
      const googleFormatCode = normalizeNullableString(row.googleFormatCode) ?? getGoogleFormatCode(metadata);
      const ocr = getOcrMetadata(metadata);
      const nextMetadata = { ...metadata };
      let nextTitle = normalizeNullableString(row.title);
      let nextBody = normalizeNullableString(row.body);
      let changed = false;
      const nextFormat = googleFormatCode === "1" ? "text" : "image";

      if (googleFormatCode === "1" && ocr) {
        const titleCandidate = getOcrCandidate(ocr.titleCandidate);
        const bodyCandidate = getOcrCandidate(ocr.bodyCandidate);

        if (!nextTitle && titleCandidate) {
          nextTitle = titleCandidate;
          changed = true;
        }

        if (!nextBody && bodyCandidate) {
          nextBody = bodyCandidate;
          changed = true;
        }
      }

      if (googleFormatCode !== "1" && ocr) {
        if (shouldClearOcrCopy(nextTitle, ocr.titleCandidate)) {
          nextTitle = null;
          stats.clearedTitle += 1;
          changed = true;
        }

        if (shouldClearOcrCopy(nextBody, ocr.bodyCandidate)) {
          nextBody = null;
          stats.clearedBody += 1;
          changed = true;
        }

        delete nextMetadata.ocr;
        stats.removedOcr += 1;
        changed = true;
      }

      if (normalizeForComparison(row.format) !== nextFormat) {
        stats.fixedFormat += 1;
        if (googleFormatCode === "1") {
          stats.restoredTextFormat += 1;
        }
        changed = true;
      }

      if (!changed) {
        continue;
      }

      stats.updated += 1;

      if (!args.dryRun) {
        await pool.execute("update ads set title = ?, body = ?, format = ?, metadata = ?, updated_at = ? where id = ?", [
          nextTitle,
          nextBody,
          nextFormat,
          JSON.stringify(nextMetadata),
          new Date(),
          row.id,
        ]);
      }
    }

    logProgress(
      [
        `${args.dryRun ? "dry-run summary" : "cleanup summary"}`,
        `scanned=${stats.scanned}`,
        `${args.dryRun ? "would_update" : "updated"}=${stats.updated}`,
        `cleared_title=${stats.clearedTitle}`,
        `cleared_body=${stats.clearedBody}`,
        `removed_ocr=${stats.removedOcr}`,
        `fixed_format=${stats.fixedFormat}`,
        `restored_text_format=${stats.restoredTextFormat}`,
      ].join(" "),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[backfill:google-image-ocr-cleanup] failed", error);
  process.exitCode = 1;
});
