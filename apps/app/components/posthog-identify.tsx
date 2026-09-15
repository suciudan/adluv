"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

export function PostHogIdentify(props: {
  userId: string;
  email: string;
  name?: string | null;
  username?: string | null;
}) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim()) {
      return;
    }

    posthog.identify(props.userId, {
      email: props.email,
      name: props.name ?? undefined,
      username: props.username ?? undefined,
    });
  }, [props.userId, props.email, props.name, props.username]);

  return null;
}
