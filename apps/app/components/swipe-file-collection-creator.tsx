"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createSwipeFileCollectionAction } from "../app/actions/swipe-file";

type CreateCollectionResponse =
  | { status: "created" | "existing" }
  | { status: "error"; message: string };

export function SwipeFileCollectionCreator({
  triggerClassName,
}: {
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={
          triggerClassName ??
          "app-button app-button-primary"
        }
      >
        New collection
      </button>

      {message ? <p className="text-[13px] leading-5 text-[#a7f3d0]">{message}</p> : null}
      {isOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[var(--overlay)] px-5 py-6">
          <div className="app-modal-surface w-full max-w-xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[24px] font-semibold leading-[30px] text-[var(--text-primary)]">
                  Create collection
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="app-icon-button"
              >
                ×
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Lead generation ads"
                className="app-input"
              />
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="High-converting hooks, demos, and webinar captures worth revisiting."
                rows={4}
                className="app-textarea"
              />

              {error ? <p className="text-[13px] leading-5 text-[#fecaca]">{error}</p> : null}

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="app-button app-button-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      setMessage(null);
                      setError(null);

                      const response = (await createSwipeFileCollectionAction({
                        name,
                        description,
                      })) as CreateCollectionResponse;

                      if (response.status === "error") {
                        setError(response.message);
                        return;
                      }

                      setMessage(response.status === "created" ? "Collection created" : "Collection already exists.");
                      if (response.status === "created") {
                        setName("");
                        setDescription("");
                        setIsOpen(false);
                      }
                      router.refresh();
                    });
                  }}
                  className="app-button app-button-primary"
                >
                  {isPending ? "Creating..." : "Create collection"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
