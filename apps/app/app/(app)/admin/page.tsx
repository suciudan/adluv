import { redirect } from "next/navigation";

import { requireWorkspaceContext } from "../../../lib/workspace";
import { isAdminUser } from "../../../lib/admin";

export default async function AdminPage() {
  const { user, workspace } = await requireWorkspaceContext();

  if (!isAdminUser(user)) {
    redirect("/ads");
  }

  redirect(`/w/${workspace.slug}/admin/ads`);
}
