"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, User2 } from "lucide-react";

import { loginAction } from "../../app/actions/auth";
import { Button } from "./button";

type LoginResponse = {
  status: "authenticated";
};

type LoginErrorResponse = {
  status: "error";
  message: string;
};

export function CmsLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <section className="rounded-md border border-white/10 bg-zinc-900 p-8 shadow-2xl shadow-black/20">
      <div className="space-y-2">
        <p className="font-sans text-xs font-semibold uppercase tracking-widest text-violet-500">Adluv CMS</p>
        <h2 className="font-sans text-4xl font-semibold text-zinc-100">Editorial sign in</h2>
        <p className="font-sans text-sm leading-6 text-zinc-400">
          Use an admin account to manage blog posts, categories, and authors.
        </p>
      </div>

      <form
        className="mt-8 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();

          startTransition(async () => {
            setError(null);

            const payload = (await loginAction({
              username,
              password,
            })) as LoginResponse | LoginErrorResponse;

            if (payload.status === "error") {
              setError(payload.message || "Unable to sign in.");
              return;
            }

            router.replace("/posts");
            router.refresh();
          });
        }}
      >
        <label className="block">
          <span className="mb-2.5 block font-sans text-sm font-medium text-zinc-100">Username</span>
          <div className="relative">
            <User2 size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-sm border border-white/10 bg-zinc-950 px-12 py-3.5 font-sans text-zinc-100 outline-none transition focus:border-violet-500"
              placeholder="Enter your username"
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-2.5 block font-sans text-sm font-medium text-zinc-100">Password</span>
          <div className="relative">
            <LockKeyhole size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-sm border border-white/10 bg-zinc-950 px-12 py-3.5 font-sans text-zinc-100 outline-none transition focus:border-violet-500"
              placeholder="Enter your password"
            />
          </div>
        </label>

        {error ? (
          <p className="rounded-sm border border-red-500/30 bg-red-500/10 px-4 py-3 font-sans text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={isPending}
          fullWidth
          size="lg"
          className="gap-2"
        >
          {isPending ? "Signing in..." : "Sign in"}
          <ArrowRight size={18} />
        </Button>
      </form>
    </section>
  );
}
