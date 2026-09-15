import type { Metadata } from "next";

import { appConfig } from "@adluv/config";

import { LegalPage } from "../../components/legal-page";
import { buildSiteMetadata } from "../metadata";

export const metadata: Metadata = buildSiteMetadata({
  title: `Terms of Service | ${appConfig.name}`,
  description: "The terms that govern use of the Adluv website and service.",
  path: "/terms-of-service",
});

export default function TermsOfServicePage() {
  return (
    <LegalPage
      contentFileName="terms-of-service.md"
      eyebrow="Legal"
      description="The terms that govern access to Adluv, including acceptable use, availability, and liability."
    />
  );
}
