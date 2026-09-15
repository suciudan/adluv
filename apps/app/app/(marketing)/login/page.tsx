import { redirect } from "next/navigation";
import { Instrument_Serif, Inter } from "next/font/google";

import { getSiteHref } from "@adluv/config";

import { AdluvLogo } from "../../../components/adluv-logo";
import { LoginForm } from "../../../components/login-form";
import { getCurrentUser } from "../../../lib/session";
import { getLocalDevCredentials } from "../../../lib/local-dev-auth";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
});

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/ads");
  }

  return (
    <main className={`${inter.variable} ${instrumentSerif.variable} min-h-screen overflow-hidden bg-[#09090f] font-sans text-white`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.12),transparent_28%),linear-gradient(180deg,rgba(9,9,15,0.98),rgba(9,9,15,1))]" />

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-0 py-12 sm:px-6">
        <AdluvLogo
          href={getSiteHref("/")}
          size="site"
          logoClassName="h-12 sm:h-14"
          textClassName="text-[34px] leading-none text-white"
          className="mb-10 px-6 sm:px-0"
        />

        <div className="w-full max-w-none sm:max-w-[480px]">
          <LoginForm enableLocalDevLogin={Boolean(getLocalDevCredentials())} />
        </div>
      </div>
    </main>
  );
}
