"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import posthog from "posthog-js";

import {
  markAllNotificationInboxItemsReadAction,
  markNotificationInboxItemReadAction,
  markNotificationInboxItemUnreadAction,
} from "../app/actions/notifications";
import { AppButton } from "./app-ui";

type ActionResponse =
  | { status: "ok"; updatedCount?: number }
  | { status: "error"; message: string };

export function NotificationInboxActions(props: {
  unreadCount: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!props.unreadCount) {
    return null;
  }

  return (
    <div className="space-y-3">
      <AppButton
        type="button"
        variant="secondary"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            setError(null);
            setMessage(null);

            const response = (await markAllNotificationInboxItemsReadAction()) as ActionResponse;

            if (response.status === "error") {
              setError(response.message);
              return;
            }

            posthog.capture("notifications_marked_all_read", {
              count: response.updatedCount ?? props.unreadCount,
            });
            setMessage(`Marked ${response.updatedCount ?? props.unreadCount} notifications as read.`);
            router.refresh();
          });
        }}
      >
        {isPending ? "Updating..." : "Mark all as read"}
      </AppButton>
      {message ? <p className="text-[13px] leading-5 text-[#a7f3d0]">{message}</p> : null}
      {error ? <p className="text-[13px] leading-5 text-[#fecaca]">{error}</p> : null}
    </div>
  );
}

export function NotificationArchiveItemActions(props: {
  deliveryId: string;
  href: string;
  isRead: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            setError(null);

            if (!props.isRead) {
              const response = (await markNotificationInboxItemReadAction(props.deliveryId)) as ActionResponse;

              if (response.status === "error") {
                setError(response.message);
                return;
              }
            }

            router.push(props.href);
          });
        }}
        className="app-button app-button-primary"
      >
        {isPending ? "Opening..." : "Open"}
      </button>

      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            setError(null);

            const response = (props.isRead
              ? await markNotificationInboxItemUnreadAction(props.deliveryId)
              : await markNotificationInboxItemReadAction(props.deliveryId)) as ActionResponse;

            if (response.status === "error") {
              setError(response.message);
              return;
            }

            router.refresh();
          });
        }}
        className="app-button app-button-secondary"
      >
        {isPending ? "Updating..." : props.isRead ? "Mark as unread" : "Mark as read"}
      </button>

      {error ? <p className="w-full text-[12px] leading-4 text-[#fecaca]">{error}</p> : null}
    </div>
  );
}

export function NotificationOpenAction(props: {
  deliveryId: string;
  href: string;
  isRead: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            setError(null);

            if (!props.isRead) {
              const response = (await markNotificationInboxItemReadAction(props.deliveryId)) as ActionResponse;

              if (response.status === "error") {
                setError(response.message);
                return;
              }
            }

            router.push(props.href);
          });
        }}
        style={props.style}
        className={props.className ?? "text-[11px] font-normal leading-4 text-[var(--accent-hover)]"}
      >
        {isPending ? "Opening..." : "Open"}
      </button>
      {error ? <p className="text-[12px] leading-4 text-[#fecaca]">{error}</p> : null}
    </div>
  );
}
