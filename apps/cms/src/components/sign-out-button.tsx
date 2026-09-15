"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { logoutAction } from "../../app/actions/auth";
import { Button } from "./button";

export function SignOutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      fullWidth
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await logoutAction();
          router.replace("/login");
          router.refresh();
        });
      }}
    >
      {isPending ? "Signing out..." : "Sign out"}
    </Button>
  );
}
