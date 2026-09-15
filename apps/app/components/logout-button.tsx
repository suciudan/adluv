"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import posthog from "posthog-js";

import { logoutAction } from "../app/actions/auth";

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      className={
        className ??
        "app-button app-button-secondary w-full"
      }
      onClick={() => {
        startTransition(async () => {
          posthog.capture("user_signed_out");
          posthog.reset();
          await logoutAction();
          router.replace("/login");
          router.refresh();
        });
      }}
    >
      {isPending ? "Signing out..." : "Sign out"}
    </button>
  );
}
