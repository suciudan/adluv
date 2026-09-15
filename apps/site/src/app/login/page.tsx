import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { getAppHref } from "@adluv/config";

import { buildSiteMetadata } from "../metadata";

export const metadata: Metadata = buildSiteMetadata({
  title: "Login | Adluv",
  description: "Redirecting to the Adluv app login.",
  path: "/login",
  noIndex: true,
});

export default function SiteLoginRedirectPage() {
  redirect(getAppHref("/login"));
}
