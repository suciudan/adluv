import { redirect } from "next/navigation";

import { getCurrentUser } from "../lib/session";

export default async function AppHomePage() {
  const user = await getCurrentUser();

  redirect(user ? "/ads" : "/login");
}
