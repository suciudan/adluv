import { Instrument_Serif, Inter } from "next/font/google"

import type {Metadata} from "next";
import {appConfig} from "@adluv/config";
import { MarketingHomepage } from "../components/marketing-homepage/App"
import { JsonLd } from "../components/json-ld";
import { buildSiteMetadata } from "./metadata";
import { getCurrentUser } from "../lib/session"
import { buildHomepageJsonLd } from "../lib/json-ld";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
})

export const metadata: Metadata = buildSiteMetadata({
  title: `${appConfig.name} | Track ads across any brand, instantly`,
  description: appConfig.tagline,
  path: "/",
});

export default async function MarketingPage() {
  const user = await getCurrentUser();

  return (
    <>
      <JsonLd data={buildHomepageJsonLd()} />
      <MarketingHomepage
        className={`${inter.variable} ${instrumentSerif.variable}`}
        isAuthenticated={Boolean(user)}
      />
    </>
  );
}
