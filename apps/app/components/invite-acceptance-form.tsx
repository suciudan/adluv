"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, User2 } from "lucide-react";

import { acceptInvitationAction } from "../app/actions/auth";

type InviteAcceptanceFormProps = {
  email: string;
  token: string;
  workspaceName: string;
};

type InviteAcceptanceResponse =
  | {
      status: "authenticated" | "accepted";
      workspaceSlug: string;
      message?: string;
    }
  | {
      status: "error";
      message: string;
    };

const inviteInputClassName =
  "w-full rounded-2xl border border-white/10 bg-white/[0.02] px-12 py-3.5 text-white outline-none transition placeholder:text-zinc-600 focus:border-violet-500 focus:bg-white/[0.04]";

export function InviteAcceptanceForm({
  email,
  token,
  workspaceName,
}: InviteAcceptanceFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <section className="rounded-none border border-white/10 bg-zinc-950/90 p-7 shadow-2xl backdrop-blur sm:rounded-3xl">
      <div className="space-y-2">
        <p className="text-sm font-medium text-violet-300">{workspaceName}</p>
        <h1
          className="text-4xl leading-none text-white"
          style={{ fontFamily: "var(--font-instrument-serif), serif" }}
        >
          Set up your account
        </h1>
        <p className="text-sm leading-6 text-zinc-400">{email}</p>
      </div>

      <form
        className="mt-7 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();

          startTransition(async () => {
            setError(null);

            const response = (await acceptInvitationAction({
              token,
              name,
              username,
              password,
            })) as InviteAcceptanceResponse;

            if (response.status === "error") {
              setError(response.message);
              return;
            }

            if (response.status === "accepted") {
              router.replace("/login");
              return;
            }

            router.replace(`/w/${response.workspaceSlug}/ads`);
          });
        }}
      >
        <label className="block">
          <span className="mb-2.5 block text-sm font-medium text-zinc-300">Name</span>
          <div className="relative">
            <User2
              size={16}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              autoComplete="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inviteInputClassName}
              placeholder="Jane Smith"
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-2.5 block text-sm font-medium text-zinc-300">Username</span>
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
              className={inviteInputClassName}
              placeholder="jane"
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-2.5 block text-sm font-medium text-zinc-300">Password</span>
          <div className="relative">
            <LockKeyhole
              size={16}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inviteInputClassName}
              placeholder="At least 8 characters"
            />
          </div>
        </label>

        {error ? (
          <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-3.5 text-sm font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Creating account..." : "Create account"}
          <ArrowRight size={20} strokeWidth={1.9} className="shrink-0" />
        </button>
      </form>
    </section>
  );
}
