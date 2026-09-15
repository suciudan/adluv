import { Instrument_Serif, Inter } from "next/font/google";
import { createHmac } from "node:crypto";

import { AppShell } from "../../components/app-shell";
import { CrispChat } from "../../components/crisp-chat";
import { PostHogIdentify } from "../../components/posthog-identify";
import { requireWorkspaceContext } from "../../lib/workspace";
import {
  getUnreadActivityNotificationCount,
  listWatchlistEntries,
  listPendingTrackedCompanies,
} from "@adluv/db";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
});

function signCrispEmail(email: string) {
  const secret = process.env.CRISP_IDENTITY_VERIFICATION_SECRET?.trim();

  if (!secret) {
    return null;
  }

  return createHmac("sha256", secret).update(email).digest("hex");
}

function getCrispUserDisplayName(user: { email: string; username?: string | null; name?: string | null }) {
  return user.name?.trim() || user.username?.trim() || user.email.trim();
}

export default async function ProductLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace, workspaces } = await requireWorkspaceContext();
  const [unreadActivityCount, pendingTrackedCompanies, watchlistEntries] = await Promise.all([
    getUnreadActivityNotificationCount(user.id, workspace.id),
    listPendingTrackedCompanies(user.id, workspace.id),
    listWatchlistEntries(user.id, workspace.id),
  ]);
  const crispWebsiteId = process.env.CRISP_WEBSITE_ID?.trim();
  const crispUserEmail = user.email.trim().toLowerCase();

  return (
    <div className={`${inter.variable} ${instrumentSerif.variable}`}>
      <AppShell
        pendingTrackedCompanies={pendingTrackedCompanies}
        user={user}
        workspace={workspace}
        workspaces={workspaces}
        watchlistNavEntries={watchlistEntries.slice(0, 8).map((entry) => ({
          advertiserId: entry.advertiserId,
          advertiserName: entry.advertiserName,
          activeAds: entry.activeAds,
        }))}
        unreadNotificationCount={unreadActivityCount}
      >
        {children}
      </AppShell>
      <PostHogIdentify
        userId={user.id}
        email={user.email}
        name={user.name}
        username={user.username}
      />
      {crispWebsiteId ? <CrispChat
        websiteId={crispWebsiteId}
        user={{
          email: crispUserEmail,
          emailSignature: signCrispEmail(crispUserEmail),
          name: getCrispUserDisplayName(user),
        }}
        workspace={{
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          role: workspace.role,
        }}
      /> : null}
    </div>
  );
}
