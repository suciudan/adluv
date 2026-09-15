import { Instrument_Serif, Inter } from "next/font/google";

import { getSiteHref } from "@adluv/config";
import { getWorkspaceInvitationPreviewByToken } from "@adluv/db";

import { AdluvLogo } from "../../../../components/adluv-logo";
import { InviteAcceptanceForm } from "../../../../components/invite-acceptance-form";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
});

function isInviteUsable(invite: Awaited<ReturnType<typeof getWorkspaceInvitationPreviewByToken>>) {
  if (!invite || invite.status !== "pending") {
    return false;
  }

  if (!invite.expiresAt) {
    return true;
  }

  return invite.expiresAt.getTime() > Date.now();
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await getWorkspaceInvitationPreviewByToken(token);
  const usable = isInviteUsable(invite);

  return (
    <main className={`${inter.variable} ${instrumentSerif.variable} min-h-screen overflow-hidden bg-zinc-950 font-sans text-white`}>
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
          {usable && invite ? (
            <InviteAcceptanceForm
              email={invite.email}
              token={token}
              workspaceName={invite.workspaceName}
            />
          ) : (
            <section className="rounded-none border border-white/10 bg-zinc-950/90 p-7 text-center shadow-2xl backdrop-blur sm:rounded-3xl">
              <h1
                className="text-4xl leading-none text-white"
                style={{ fontFamily: "var(--font-instrument-serif), serif" }}
              >
                Invite unavailable
              </h1>
              <p className="mt-4 text-sm leading-6 text-zinc-400">
                This invitation link is invalid, expired, or already used.
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
