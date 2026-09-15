"use client";

import type { ReactNode } from "react";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { ChevronDown, LoaderCircle } from "lucide-react";

import type { SaveAdModalState } from "@adluv/db";

import posthog from "posthog-js";

import { getSaveAdModalStateAction, saveAdToSwipeFileAction } from "../app/actions/ads";

type ModalResponse =
  | {
      status: "ok";
      state: SaveAdModalState;
    }
  | {
      status: "error";
      message: string;
    };

type SaveResponse =
  | {
      status: "ok";
      savedAdId: string;
      created: boolean;
    }
  | {
      status: "error";
      message: string;
    };

const emptyState: SaveAdModalState = {
  savedAdId: null,
  note: "",
  selectedCollectionIds: [],
  collections: [],
};

export function SaveAdModalTrigger({
  adId,
  initialSaved,
  className,
  idleLabel = "Save",
  savedLabel = "Saved",
  ariaLabel,
  icon,
  children,
}: {
  adId: string;
  initialSaved: boolean;
  className?: string;
  idleLabel?: string;
  savedLabel?: string;
  ariaLabel?: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [isSaved, setIsSaved] = useState(initialSaved);
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<SaveAdModalState>(emptyState);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [note, setNote] = useState("");
  const [createNewCollection, setCreateNewCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, startLoading] = useTransition();
  const [isSaving, startSaving] = useTransition();

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  useEffect(() => {
    if (!toastMessage) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setToastMessage(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel ?? (isSaved ? savedLabel : idleLabel)}
        onClick={() => {
          setIsOpen(true);
          setCreateNewCollection(false);
          setNewCollectionName("");
          startLoading(async () => {
            const response = (await getSaveAdModalStateAction(adId)) as ModalResponse;

            if (response.status === "error") {
              setError(response.message);
              return;
            }

            setError(null);
            setState(response.state);
            setNote(response.state.note);
            setSelectedCollectionId(response.state.selectedCollectionIds[0] ?? "");
          });
        }}
        className={
          [
            className ?? "app-button app-button-secondary",
            isOpen ? "pointer-events-none opacity-0" : "",
          ]
            .filter(Boolean)
            .join(" ")
        }
      >
        {children ?? (
          <>
            {icon}
            {isSaved ? savedLabel : idleLabel}
          </>
        )}
      </button>

      {isMounted && toastMessage
        ? createPortal(
        <div className="fixed bottom-5 right-5 z-[70] w-[320px] rounded-[18px] border border-[rgba(16,185,129,0.22)] bg-[var(--bg-surface-1)] px-4 py-3 text-[14px] font-medium leading-[22px] text-[#a7f3d0] shadow-[var(--shadow-overlay)]">
          {toastMessage}
        </div>,
          document.body,
        )
        : null}

      {isMounted && isOpen
        ? createPortal(
        <div
          data-save-ad-modal="true"
          className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-[var(--overlay)] px-3 py-3 sm:items-center sm:px-5 sm:py-6"
        >
          <button
            type="button"
            aria-label="Close save modal"
            className="absolute inset-0"
            onClick={() => {
              setIsOpen(false);
              setCreateNewCollection(false);
              setNewCollectionName("");
            }}
          />
          <div className="app-modal-surface relative z-[1] isolate w-full max-w-2xl p-4 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[22px] font-semibold leading-[28px] text-[var(--text-primary)] sm:text-[24px] sm:leading-[30px]">
                  Save ad
                </h2>
              </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setCreateNewCollection(false);
                    setNewCollectionName("");
                  }}
                  className="app-icon-button"
                >
                  ×
              </button>
            </div>

            {isLoading ? (
              <div className="mt-5 flex min-h-40 items-center justify-center rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] sm:mt-6 sm:min-h-56">
                <LoaderCircle
                  size={26}
                  strokeWidth={1.9}
                  className="animate-spin text-[var(--text-secondary)]"
                  aria-label="Loading save options"
                />
              </div>
            ) : (
              <div className="mt-5 space-y-5 sm:mt-6">
                <div className="space-y-3">
                  <label className="grid gap-2">
                    <span className="text-[12px] font-medium leading-4 text-[var(--text-secondary)]">Collection</span>
                    {createNewCollection ? (
                      <input
                        value={newCollectionName}
                        onChange={(event) => setNewCollectionName(event.target.value)}
                        className="app-input"
                        placeholder="Collection name"
                      />
                    ) : (
                      <div className="relative">
                        <select
                          value={selectedCollectionId}
                          onChange={(event) => setSelectedCollectionId(event.target.value)}
                          className="app-select appearance-none bg-none pr-14"
                        >
                          <option value="">No collection selected</option>
                          {state.collections.map((collection) => (
                            <option key={collection.id} value={collection.id}>
                              {collection.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={18}
                          strokeWidth={1.9}
                          className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                        />
                      </div>
                    )}
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setCreateNewCollection((current) => !current);
                      setNewCollectionName("");
                    }}
                    className="inline-flex text-[13px] font-medium leading-5 text-[var(--accent-hover)] transition hover:text-[var(--text-primary)]"
                  >
                    {createNewCollection ? "Cancel new collection" : "Create new collection"}
                  </button>
                </div>

                <label className="grid gap-2 border-t border-[var(--border-subtle)] pt-5">
                  <span className="text-[12px] font-medium leading-4 text-[var(--text-secondary)]">Note (optional)</span>
                  <textarea
                    rows={4}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    className="app-textarea"
                  />
                </label>

                {error ? <p className="text-[13px] leading-5 text-[#fecaca]">{error}</p> : null}

                <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      setCreateNewCollection(false);
                      setNewCollectionName("");
                    }}
                    className="app-button app-button-secondary w-full sm:w-auto"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => {
                      startSaving(async () => {
                        const response = (await saveAdToSwipeFileAction({
                          adId,
                          note,
                          collectionId: selectedCollectionId || undefined,
                          createCollectionName: createNewCollection ? newCollectionName : undefined,
                        })) as SaveResponse;

                        if (response.status === "error") {
                          setError(response.message);
                          return;
                        }

                        posthog.capture("ad_saved_to_swipe_file", {
                          ad_id: adId,
                          has_note: note.trim().length > 0,
                          has_collection: Boolean(selectedCollectionId || (createNewCollection && newCollectionName)),
                        });
                        if (createNewCollection && newCollectionName.trim()) {
                          posthog.capture("swipe_file_collection_created", {
                            collection_name: newCollectionName.trim(),
                          });
                        }
                        setError(null);
                        setIsSaved(true);
                        setIsOpen(false);
                        setCreateNewCollection(false);
                        setNewCollectionName("");
                        setToastMessage("Ad saved to swipe file");
                        router.refresh();
                      });
                    }}
                    className="app-button app-button-primary w-full sm:w-auto"
                  >
                    {isSaving ? "Saving..." : "Save ad"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
          document.body,
        )
        : null}
    </>
  );
}
