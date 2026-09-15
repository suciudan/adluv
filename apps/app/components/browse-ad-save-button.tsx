import type { ReactNode } from "react";

import { SaveAdModalTrigger } from "./save-ad-modal-trigger";

export function BrowseAdSaveButton({
  adId,
  initialSaved,
  className,
  ariaLabel,
  children,
}: {
  adId: string;
  initialSaved: boolean;
  className?: string;
  ariaLabel?: string;
  children?: ReactNode;
}) {
  return (
    <SaveAdModalTrigger adId={adId} initialSaved={initialSaved} className={className} ariaLabel={ariaLabel}>
      {children}
    </SaveAdModalTrigger>
  );
}
