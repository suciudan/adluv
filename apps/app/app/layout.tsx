import type { Metadata } from "next";

import { appConfig } from "@adluv/config";
import { validateStartupEnvironment } from "@adluv/config/startup";

import { appThemeInitScript } from "../lib/theme";
import "./globals.css";

validateStartupEnvironment("app");

export const metadata: Metadata = {
  title: `${appConfig.name} | Ad Intelligence`,
  description: appConfig.tagline,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: appThemeInitScript }} />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
