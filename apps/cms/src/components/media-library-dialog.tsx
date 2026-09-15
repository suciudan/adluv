"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";

import type { MediaAsset, MediaCollection } from "../lib/media";
import { Button } from "./button";

function formatAssetMeta(asset: MediaAsset) {
  const sizeInKb = Math.max(1, Math.round(asset.size / 1024));
  const date = new Date(asset.uploadedAt).toLocaleDateString();
  return `${sizeInKb} KB • ${date}`;
}

export function MediaLibraryDialog({
  open,
  collection,
  selectedValue,
  confirmValueMode = "pathname",
  title = "Media library",
  description = "Select an existing file or upload a new one.",
  confirmLabel = "Select",
  onClose,
  onConfirm,
}: {
  open: boolean;
  collection: MediaCollection | MediaCollection[];
  selectedValue: string;
  confirmValueMode?: "pathname" | "url";
  title?: string;
  description?: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
}) {
  const collections = useMemo(
    () => (Array.isArray(collection) ? collection : [collection]),
    [collection],
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<"library" | "upload">("library");
  const [pendingSelection, setPendingSelection] = useState<string>(selectedValue);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setPendingSelection(selectedValue);
  }, [open, selectedValue]);

  useEffect(() => {
    if (!open) {
      return;
    }

    void (async () => {
      setIsLoading(true);
      setError(null);

      try {
        const payloads = await Promise.all(
          collections.map(async (currentCollection) => {
            const response = await fetch(`/api/media?collection=${currentCollection}`, { cache: "no-store" });
            const payload = (await response.json()) as { assets?: MediaAsset[]; message?: string };

            if (!response.ok) {
              throw new Error(payload.message ?? "Unable to load assets.");
            }

            return payload.assets ?? [];
          }),
        );

        setAssets(payloads.flat().sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt)));
        setPendingSelection((current) => current || selectedValue);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Unable to load assets.");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [collections, open, selectedValue]);

  const pendingAsset =
    assets.find((asset) => asset.pathname === pendingSelection || asset.url === pendingSelection) ?? null;

  const upload = async (file: File) => {
    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("collection", collections[0]);
      formData.set("file", file);

      const response = await fetch("/api/media", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as { asset?: MediaAsset; message?: string };

      if (!response.ok || !payload.asset) {
        throw new Error(payload.message ?? "Upload failed.");
      }

      setAssets((current) => [payload.asset!, ...current.filter((asset) => asset.pathname !== payload.asset!.pathname)]);
      setPendingSelection(payload.asset.pathname);
      setActiveTab("library");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const deleteSelectedAsset = async () => {
    if (!pendingAsset) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch("/api/media", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          collection: pendingAsset.collection,
          pathname: pendingAsset.pathname,
        }),
      });
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Unable to delete file.");
      }

      setAssets((current) => current.filter((asset) => asset.pathname !== pendingAsset.pathname));
      setPendingSelection((current) => (current === pendingAsset.pathname || current === pendingAsset.url ? "" : current));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete file.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDroppedFiles = (files: FileList | null) => {
    const file = files?.[0];

    if (!file) {
      return;
    }

    void upload(file);
  };

  const dropzoneClassName = [
    "w-full max-w-2xl rounded-lg border border-dashed p-8 text-center transition",
    isDraggingFile
      ? "border-violet-500 bg-violet-500/10"
      : "border-white/10 bg-zinc-900/80",
  ].join(" ");

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 font-sans">
      <div className="flex h-[min(720px,90vh)] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-white/10 bg-zinc-950 font-sans shadow-2xl shadow-black/50">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file) {
              void upload(file);
            }
          }}
        />

        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="font-sans text-base font-semibold text-zinc-100">{title}</p>
            <p className="mt-1 font-sans text-sm text-zinc-500">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/10 px-3 py-2 font-sans text-sm text-zinc-400 transition hover:border-violet-500 hover:text-zinc-100"
          >
            Close
          </button>
        </div>

        <div className="border-b border-white/10 px-5">
          <div className="flex gap-2 py-3">
            <button
              type="button"
              onClick={() => setActiveTab("library")}
              className={[
                "rounded-md px-3 py-2 font-sans text-sm transition",
                activeTab === "library"
                  ? "bg-violet-500 text-white"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
              ].join(" ")}
            >
              Library
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("upload")}
              className={[
                "rounded-md px-3 py-2 font-sans text-sm transition",
                activeTab === "upload"
                  ? "bg-violet-500 text-white"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
              ].join(" ")}
            >
              Upload files
            </button>
          </div>
        </div>

        {error ? (
          <div className="border-b border-red-500/20 bg-red-500/10 px-5 py-3 font-sans text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {activeTab === "upload" ? (
          <div className="grid flex-1 place-items-center p-5">
            <div
              className={dropzoneClassName}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setIsDraggingFile(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDraggingFile(false);
                handleDroppedFiles(event.dataTransfer.files);
              }}
            >
              <p className="font-sans text-lg font-medium text-zinc-100">Drop in a new file</p>
              <p className="mt-2 font-sans text-sm leading-6 text-zinc-500">
                Upload directly into the media library, then choose it for this field.
              </p>
              <div className="mt-6 flex justify-center">
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? "Uploading..." : "Select file"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-h-0 overflow-y-auto p-5">
              {isLoading ? (
                <div className="py-10 font-sans text-sm text-zinc-500">Loading assets...</div>
              ) : assets.length ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {assets.map((asset) => {
                    const isSelected =
                      asset.pathname === pendingSelection || asset.url === pendingSelection;

                    return (
                      <button
                        key={asset.pathname}
                        type="button"
                        onClick={() => setPendingSelection(asset.pathname)}
                        className={[
                          "overflow-hidden rounded-md border bg-zinc-900 text-left transition",
                          isSelected
                            ? "border-violet-500 ring-1 ring-violet-500"
                            : "border-white/10 hover:border-violet-400/60",
                        ].join(" ")}
                      >
                        <div className="aspect-square bg-zinc-950">
                          <img src={asset.url} alt="" className="h-full w-full object-cover" />
                        </div>
                        <div className="space-y-1 px-3 py-3 font-sans">
                          <p className="truncate text-sm font-medium text-zinc-100">{asset.fileName}</p>
                          <p className="text-xs text-zinc-500">{formatAssetMeta(asset)}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div
                  className={[
                    "grid h-full place-items-center rounded-lg border border-dashed p-8 text-center transition",
                    isDraggingFile
                      ? "border-violet-500 bg-violet-500/10"
                      : "border-white/10 bg-zinc-900/50",
                  ].join(" ")}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDraggingFile(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    setIsDraggingFile(false);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDraggingFile(false);
                    handleDroppedFiles(event.dataTransfer.files);
                  }}
                >
                  <div>
                    <p className="font-sans text-base font-medium text-zinc-100">No media uploaded yet.</p>
                    <p className="mt-2 font-sans text-sm text-zinc-500">
                      Drag a file into this box or upload your first file into the media library.
                    </p>
                    <div className="mt-5">
                      <Button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                      >
                        {isUploading ? "Uploading..." : "Upload files"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <aside className="flex min-h-0 flex-col border-t border-white/10 bg-zinc-900/60 p-5 lg:border-l lg:border-t-0">
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <p className="font-sans text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Attachment details
                </p>
                {pendingAsset ? (
                  <div className="mt-4 space-y-4">
                    <div className="overflow-hidden rounded-md border border-white/10 bg-zinc-950">
                      <div className="aspect-square bg-zinc-950">
                        <img src={pendingAsset.url} alt="" className="h-full w-full object-cover" />
                      </div>
                    </div>
                    <div className="space-y-2 font-sans text-sm">
                      <p className="break-all font-medium text-zinc-100">{pendingAsset.fileName}</p>
                      <p className="text-zinc-500">{formatAssetMeta(pendingAsset)}</p>
                      <p className="text-zinc-500">{pendingAsset.collection === "blog-media" ? "Blog media" : "Author avatars"}</p>
                      <p className="break-all text-zinc-500">{pendingAsset.pathname}</p>
                    </div>
                    <div className="pt-2">
                      <button
                        type="button"
                        aria-label="Delete selected asset from library"
                        title="Delete from library"
                        disabled={isDeleting}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 text-red-300 transition hover:bg-red-500/20 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => {
                          if (!pendingAsset) {
                            return;
                          }

                          const shouldDelete = window.confirm(
                            `Delete "${pendingAsset.fileName}" from the media library? This cannot be undone.`,
                          );

                          if (!shouldDelete) {
                            return;
                          }

                          void deleteSelectedAsset();
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 font-sans text-sm leading-6 text-zinc-500">
                    Select a file from the library to preview it here.
                  </p>
                )}
              </div>
            </aside>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 font-sans text-sm text-zinc-500">
            {pendingAsset ? pendingAsset.fileName : "No file selected"}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pendingSelection ? (
              <Button
                type="button"
                variant="secondary"
                disabled={isDeleting}
                onClick={() => setPendingSelection("")}
              >
                Clear
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              disabled={isDeleting}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!pendingSelection || isDeleting}
              onClick={() => {
                onConfirm(
                  confirmValueMode === "url" && pendingAsset ? pendingAsset.url : pendingSelection,
                );
                onClose();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
