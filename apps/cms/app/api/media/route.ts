import { NextResponse } from "next/server";

import { requireCurrentAdmin } from "../../../src/lib/session";
import { deleteMediaAsset, listMediaAssets, saveMediaFile, type MediaCollection } from "../../../src/lib/media";

function parseCollection(value: string | null): MediaCollection {
  if (value === "blog-media" || value === "author-avatars") {
    return value;
  }

  throw new Error("Invalid media collection.");
}

export async function GET(request: Request) {
  await requireCurrentAdmin();

  try {
    const collection = parseCollection(new URL(request.url).searchParams.get("collection"));
    const assets = await listMediaAssets(collection);

    return NextResponse.json({ assets });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load media assets." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  await requireCurrentAdmin();

  try {
    const formData = await request.formData();
    const collection = parseCollection(String(formData.get("collection") ?? ""));
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ message: "No file uploaded." }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    if (bytes.byteLength === 0) {
      return NextResponse.json({ message: "Empty file upload." }, { status: 400 });
    }

    if (bytes.byteLength > 10 * 1024 * 1024) {
      return NextResponse.json({ message: "File is too large. Max 10 MB." }, { status: 400 });
    }

    const asset = await saveMediaFile({
      collection,
      fileName: file.name,
      contentType: file.type,
      bytes,
    });

    return NextResponse.json({ asset });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to upload file." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  await requireCurrentAdmin();

  try {
    const payload = (await request.json()) as {
      collection?: string;
      pathname?: string;
    };
    const collection = parseCollection(payload.collection ?? null);
    const pathname = payload.pathname?.trim();

    if (!pathname) {
      return NextResponse.json({ message: "Missing media asset path." }, { status: 400 });
    }

    await deleteMediaAsset({ collection, pathname });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to delete file." },
      { status: 400 },
    );
  }
}
