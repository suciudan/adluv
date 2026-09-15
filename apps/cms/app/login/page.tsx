import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { isAuthUserAdmin } from "@adluv/auth";

import { CmsLoginForm } from "../../src/components/cms-login-form";
import { getCurrentUser } from "../../src/lib/session";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function CmsLoginPage() {
  const user = await getCurrentUser();

  if (user) {
    const isAdmin = await isAuthUserAdmin(user.id, process.env);
    redirect(isAdmin ? "/posts" : "/forbidden");
  }

  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <CmsLoginForm />
        </div>
      </div>
    </main>
  );
}
