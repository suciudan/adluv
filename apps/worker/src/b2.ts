import { loadWorkspaceEnv } from "@adluv/config/load-env";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

type StoredObjectMetadata = {
  contentType: string | null;
  metadata: Record<string, string>;
};

let client: S3Client | null = null;

function trimEnv(key: string) {
  const value = process.env[key]?.trim();
  return value && value.length > 0 ? value : null;
}

function normalizeEndpoint(value: string) {
  return value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;
}

function inferRegionFromEndpoint(endpoint: string) {
  try {
    const hostname = new URL(endpoint).hostname;
    const match = hostname.match(/^s3\.([^.]+)\.backblazeb2\.com$/);
    return match?.[1] ?? "us-east-1";
  } catch {
    return "us-east-1";
  }
}

function isMissingObjectError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    candidate.name === "NotFound" ||
    candidate.name === "NoSuchKey" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

function getClient() {
  if (client) {
    return client;
  }

  const endpoint = trimEnv("B2_ENDPOINT");
  const accessKeyId = trimEnv("B2_APPLICATION_KEY_ID");
  const secretAccessKey = trimEnv("B2_APPLICATION_KEY");

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("B2 object storage is not configured.");
  }

  client = new S3Client({
    region: inferRegionFromEndpoint(endpoint),
    endpoint: normalizeEndpoint(endpoint),
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return client;
}

function getBucketName() {
  const bucket = trimEnv("B2_BUCKET_NAME");

  if (!bucket) {
    throw new Error("B2 bucket name is not configured.");
  }

  return bucket;
}

function normalizeMetadata(metadata?: Record<string, string | null | undefined>) {
  return Object.fromEntries(
    Object.entries(metadata ?? {}).flatMap(([key, value]) =>
      typeof value === "string" && value.length > 0 ? [[key, value]] : [],
    ),
  );
}

function toObjectKey(pathname: string) {
  return pathname.replace(/^\/+/, "");
}

export function isB2StorageConfigured() {
  loadWorkspaceEnv();

  return Boolean(
    trimEnv("B2_ENDPOINT") &&
      trimEnv("B2_BUCKET_NAME") &&
      trimEnv("B2_APPLICATION_KEY_ID") &&
      trimEnv("B2_APPLICATION_KEY"),
  );
}

export async function headStoredObject(pathname: string): Promise<StoredObjectMetadata | null> {
  if (!isB2StorageConfigured()) {
    return null;
  }

  try {
    const response = await getClient().send(
      new HeadObjectCommand({
        Bucket: getBucketName(),
        Key: toObjectKey(pathname),
      }),
    );

    return {
      contentType: response.ContentType ?? null,
      metadata: response.Metadata ?? {},
    };
  } catch (error) {
    if (isMissingObjectError(error)) {
      return null;
    }

    throw error;
  }
}

export async function uploadStoredObject(input: {
  pathname: string;
  body: Buffer;
  contentType?: string | null;
  metadata?: Record<string, string | null | undefined>;
}) {
  if (!isB2StorageConfigured()) {
    return;
  }

  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: toObjectKey(input.pathname),
      Body: input.body,
      ContentType: input.contentType ?? undefined,
      Metadata: normalizeMetadata(input.metadata),
    }),
  );
}
