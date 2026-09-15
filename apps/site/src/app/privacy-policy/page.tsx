import type { Metadata } from "next";

import { appConfig } from "@adluv/config";

import { LegalPage } from "../../components/legal-page";
import { buildSiteMetadata } from "../metadata";

export const metadata: Metadata = buildSiteMetadata({
  title: `Privacy Policy | ${appConfig.name}`,
  description: "How Adluv collects, uses, and protects personal data for the website and waitlist.",
  path: "/privacy-policy",
});

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      contentFileName="privacy-policy.md"
      eyebrow="Legal"
      description="How Adluv collects, uses, and protects personal data related to the website, analytics, and waitlist."
    />
  );
}
