"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound, LockKeyhole, User2 } from "lucide-react";

import posthog from "posthog-js";

import { localDevLoginAction, loginAction } from "../app/actions/auth";

type LoginResponse = {
  status: "authenticated";
};

type LoginErrorResponse = {
  status: "error";
  message: string;
};

type LoginFormProps = {
  enableLocalDevLogin?: boolean;
};

export function LoginForm({ enableLocalDevLogin = false }: LoginFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function finishAuthenticated(nextUsername: string) {
    posthog.capture("user_signed_in", { username: nextUsername });

    try {
      router.replace("/ads");
    } catch {
      setError("Unable to finish signing in. Please try again.");
    }
  }

  return (
    <section className="rounded-none border border-white/10 bg-[rgba(17,17,25,0.92)] p-7 shadow-[0_24px_80px_rgba(0,0,0,0.34)] backdrop-blur sm:rounded-[28px]">
      <div className="space-y-2">
        <h2
          className="text-[42px] leading-[0.98] tracking-[-0.045em] text-white"
          style={{ fontFamily: "var(--font-instrument-serif), serif" }}
        >
          Welcome back
        </h2>
      </div>

      <form
        className="mt-7 space-y-5"
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

            finishAuthenticated(username);
          });
        }}
      >
        <label className="block">
          <span className="mb-2.5 block text-[13px] font-medium text-zinc-300">Username</span>
          <div className="relative">
            <User2
              size={16}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-[16px] border border-white/10 bg-white/[0.02] px-12 py-3.5 text-white outline-none transition placeholder:text-zinc-600 focus:border-violet-400 focus:bg-white/[0.04]"
              placeholder="Enter your username"
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-2.5 block text-[13px] font-medium text-zinc-300">Password</span>
          <div className="relative">
            <LockKeyhole
              size={16}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-[16px] border border-white/10 bg-white/[0.02] px-12 py-3.5 text-white outline-none transition placeholder:text-zinc-600 focus:border-violet-400 focus:bg-white/[0.04]"
              placeholder="Enter your password"
            />
          </div>
        </label>

        {error ? (
          <p className="rounded-[16px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-[16px] bg-violet-600 px-5 py-3.5 text-sm font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Signing in..." : "Sign in"}
          <ArrowRight size={20} strokeWidth={1.9} className="shrink-0" />
        </button>

        {enableLocalDevLogin ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                setError(null);

                const payload = (await localDevLoginAction()) as LoginResponse | LoginErrorResponse;

                if (payload.status === "error") {
                  setError(payload.message || "Unable to sign in.");
                  return;
                }

                finishAuthenticated("admin");
              });
            }}
            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-[16px] border border-white/10 bg-white/[0.03] px-5 py-3.5 text-sm font-medium text-zinc-100 transition hover:border-violet-500 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <KeyRound size={18} strokeWidth={1.9} className="shrink-0" />
            <span>{isPending ? "Signing in..." : "Continue as local admin"}</span>
          </button>
        ) : null}
      </form>
    </section>
  );
}
