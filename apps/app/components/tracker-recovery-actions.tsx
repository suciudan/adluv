"use client";

import { useState, useTransition } from "react";

import { Button } from "@adluv/ui";

import { retryTrackedCompanyAction } from "../app/actions/tracking";

type RetryResponse = {
  status: "queued";
  trackedCompany: {
    id: string;
    status: string;
  };
};

type RetryErrorResponse = {
  status: "error";
  message: string;
};

export function TrackerRecoveryActions(props: {
  trackedCompanyId: string;
  status: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (props.status !== "retryable_error" && props.status !== "paused") {
    return null;
  }

  return (
    <div className="mt-4 space-y-3">
      <Button
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            try {
              setError(null);
              setMessage(null);

              const payload = (await retryTrackedCompanyAction(props.trackedCompanyId)) as RetryResponse | RetryErrorResponse;

              if (payload.status === "error") {
                throw new Error("message" in payload ? payload.message : "Unable to resume updates.");
              }

              setMessage("Update queued. Refresh the page after the worker runs to see the updated status.");
            } catch (resumeError) {
              setError(resumeError instanceof Error ? resumeError.message : "Unable to resume updates.");
            }
          });
        }}
      >
        {isPending ? "Queueing..." : props.status === "paused" ? "Resume updates" : "Check for updates"}
      </Button>
      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
