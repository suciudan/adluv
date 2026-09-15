import type { Metadata } from "next";
import Link from "next/link";

import { buttonClassName } from "../../src/components/button";

export const metadata: Metadata = {
  title: "Access denied",
};

export default function ForbiddenPage() {
  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="mx-auto flex min-h-screen max-w-4xl items-center justify-center px-6 py-12">
        <div className="w-full max-w-3xl rounded-md border border-white/10 bg-zinc-900 p-10 text-center shadow-2xl shadow-black/20">
          <p className="font-sans text-xs font-semibold uppercase tracking-widest text-violet-500">Access denied</p>
          <h1 className="mt-4 font-sans text-4xl text-zinc-100">This workspace is admin-only.</h1>
          <p className="mt-4 font-sans text-sm leading-6 text-zinc-400">
            Your account is signed in, but it does not have the admin role required to open the CMS.
          </p>
          <Link
            href="/login"
            className={buttonClassName({ size: "sm", className: "mt-6" })}
          >
            Back to login
          </Link>
        </div>
      </div>
    </main>
  );
}
