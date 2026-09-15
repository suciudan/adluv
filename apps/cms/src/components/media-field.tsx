"use client";

import { useEffect, useState } from "react";

import type { MediaCollection } from "../lib/media";
import { Button } from "./button";
import { MediaLibraryDialog } from "./media-library-dialog";

export function MediaField({
  label,
  collection,
  value,
  onChange,
  emptyLabel,
  showOpenButton = true,
}: {
  label: string;
  collection: MediaCollection;
  value: string;
  onChange: (value: string) => void;
  emptyLabel: string;
  showOpenButton?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(value);
  const hasHeader = Boolean(label);
  const openLibrary = () => {
    setIsOpen(true);
  };

  useEffect(() => {
    if (!value) {
      setPreviewUrl("");
      return;
    }

    if (/^https?:\/\//.test(value)) {
      setPreviewUrl(value);
      return;
    }

    let isCancelled = false;

    void (async () => {
      try {
        const response = await fetch(`/api/media?collection=${collection}`, { cache: "no-store" });
        const payload = (await response.json()) as {
          assets?: Array<{ pathname: string; url: string }>;
          message?: string;
        };

        if (!response.ok) {
          throw new Error(payload.message ?? "Unable to resolve media asset URL.");
        }

        const matchedAsset = payload.assets?.find((asset) => asset.pathname === value);

        if (!isCancelled) {
          setPreviewUrl(matchedAsset?.url ?? value);
        }
      } catch {
        if (!isCancelled) {
          setPreviewUrl(value);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [collection, value]);

  return (
    <div className="grid gap-3">
      {hasHeader ? (
        <div className="flex items-center justify-between gap-3">
          <span className="font-sans text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {label}
          </span>
        </div>
      ) : null}

      {value ? (
        <div className="group relative overflow-hidden rounded-md border border-white/10 bg-zinc-900">
          <div className="aspect-[16/9] bg-zinc-950">
            <img
              src={previewUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
          <div className="absolute inset-x-0 top-0 flex justify-end gap-2 p-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            {showOpenButton ? (
              <Button type="button" variant="secondary" size="sm" onClick={openLibrary}>
                Change
              </Button>
            ) : null}
            <Button type="button" variant="secondary" size="sm" onClick={() => onChange("")}>
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openLibrary}
          className="rounded-md border border-dashed border-white/10 bg-zinc-900/60 px-4 py-4 text-center transition hover:border-violet-500 hover:bg-zinc-900"
        >
          <span className="block font-sans text-sm text-zinc-300">Select an image</span>
        </button>
      )}

      <MediaLibraryDialog
        open={isOpen}
        collection={collection}
        selectedValue={value}
        onClose={() => setIsOpen(false)}
        onConfirm={onChange}
      />
    </div>
  );
}
