import type { Metadata } from "next";

import { appConfig } from "@adluv/config";
import { validateStartupEnvironment } from "@adluv/config/startup";

import { getMetadataBase } from "./metadata";
import "./globals.css";

validateStartupEnvironment("site");

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  applicationName: appConfig.name,
  title: `${appConfig.name} | Ad Intelligence`,
  description: appConfig.tagline,
  openGraph: {
    siteName: appConfig.name,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const configuredGtmId = process.env.GTM_CONTAINER_ID?.trim() ?? "";
  const gtmId = /^GTM-[A-Z0-9]+$/.test(configuredGtmId) ? configuredGtmId : null;

  return (
    <html lang="en">
      <head>
        {gtmId ? <script
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');`,
          }}
        /> : null}
      </head>
      <body className="antialiased">
        {gtmId ? <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript> : null}
        {children}
      </body>
    </html>
  );
}
