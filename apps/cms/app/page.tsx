import { redirect } from "next/navigation";

import { getCurrentUser } from "../src/lib/session";
import { isAuthUserAdmin } from "@adluv/auth";

export default async function CmsHomePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const isAdmin = await isAuthUserAdmin(user.id, process.env);

  redirect(isAdmin ? "/posts" : "/forbidden");
}
