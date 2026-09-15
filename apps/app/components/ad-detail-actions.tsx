"use client";

import { Bell } from "lucide-react";

import { SaveAdModalTrigger } from "./save-ad-modal-trigger";

export function AdDetailActions({
  adId,
  initialSaved,
}: {
  adId: string;
  initialSaved: boolean;
}) {
  return (
    <SaveAdModalTrigger
      adId={adId}
      initialSaved={initialSaved}
      className={[
        "app-icon-button",
        initialSaved ? "border-[rgba(167,139,250,0.28)] text-[#a78bfa] hover:text-white" : "",
      ].join(" ")}
      idleLabel="Save ad"
      savedLabel="Saved ad"
      ariaLabel={initialSaved ? "Saved ad" : "Save ad"}
    >
      <Bell size={16} strokeWidth={1.9} />
    </SaveAdModalTrigger>
  );
}
