import { redirect } from "next/navigation";

import { requireWorkspaceContext } from "../../../lib/workspace";

export default async function SettingsPage() {
  const { workspace } = await requireWorkspaceContext();

  redirect(`/w/${workspace.slug}/settings/account`);
}
