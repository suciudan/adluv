import { notFound } from "next/navigation";
import { getAccountSettingsSummary, getUserNotificationSettingsSummary } from "@adluv/db";

import { SettingsPageContent } from "../../../../components/settings-page-content";
import { isSettingsSectionId } from "../../../../lib/settings-sections";
import { requireWorkspaceContext } from "../../../../lib/workspace";

export default async function SettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  if (!isSettingsSectionId(section)) {
    notFound();
  }

  const { user, workspace } = await requireWorkspaceContext();
  const [accountSummary, notificationSettings] = await Promise.all([
    getAccountSettingsSummary({
      userId: user.id,
      workspaceId: workspace.id,
      email: user.email,
      username: user.username ?? null,
      name: user.name ?? null,
      hasPassword: true,
    }),
    getUserNotificationSettingsSummary(user.id),
  ]);

  return (
    <SettingsPageContent
      accountSummary={accountSummary}
      activeSection={section}
      notificationSettings={notificationSettings}
      workspace={workspace}
    />
  );
}
