import type { Metadata } from "next";

import { appConfig } from "@adluv/config";
import { validateStartupEnvironment } from "@adluv/config/startup";

import "./globals.css";

validateStartupEnvironment("app");

export const metadata: Metadata = {
  title: {
    default: "Editor",
    template: "%s | Editor",
  },
  description: "Internal blog publishing workspace for Adluv.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
