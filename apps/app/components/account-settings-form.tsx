"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, Card } from "@adluv/ui";

import { updateProfileAction } from "../app/actions/account";

type ProfileResponse =
  | {
      status: "ok";
      user: {
        email: string;
        username: string;
        name: string;
      };
    }
  | {
      status: "error";
      message: string;
    };

function Field(props: {
  autoComplete?: string;
  description: string;
  label: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  type?: string;
  value: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold text-[var(--text-primary)]">{props.label}</span>
      <p className="text-sm leading-6 text-[var(--text-secondary)]">{props.description}</p>
      <input
        type={props.type ?? "text"}
        autoComplete={props.autoComplete}
        readOnly={props.readOnly}
        value={props.value}
        onChange={(event) => props.onChange?.(event.target.value)}
        className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--field-bg)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-violet-500 read-only:cursor-default read-only:text-[var(--text-tertiary)]"
      />
    </label>
  );
}

export function AccountSettingsForm({
  initialUser,
}: {
  initialUser: {
    email: string;
    username: string;
    name: string;
  };
}) {
  const router = useRouter();
  const [form, setForm] = useState(initialUser);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <Card className="rounded-md border-[var(--border-subtle)] bg-[var(--bg-surface-1)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">Account</p>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">Profile and sign-in identity</h2>
        </div>
        <div className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-3 py-1 text-xs uppercase tracking-wide text-[var(--text-secondary)]">
          Better Auth profile
        </div>
      </div>

      <form
        className="mt-6 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();

          startTransition(async () => {
            setError(null);
            setSuccess(null);

            const response = (await updateProfileAction(form)) as ProfileResponse;

            if (response.status === "error") {
              setError(response.message);
              return;
            }

            setForm(response.user);
            setSuccess("Profile updated.");
            router.refresh();
          });
        }}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <Field
            label="Display name"
            description="This is the operator name shown around the app shell."
            value={form.name}
            autoComplete="name"
            onChange={(value) => {
              setForm((current) => ({
                ...current,
                name: value,
              }));
            }}
          />

          <Field
            label="Username"
            description="Stored in your Better Auth profile. It is normalized to lowercase when saved."
            value={form.username}
            autoComplete="username"
            onChange={(value) => {
              setForm((current) => ({
                ...current,
                username: value,
              }));
            }}
          />
        </div>

        <Field
          label="Email"
          description="This stays read-only for now because Better Auth uses the primary account email."
          value={form.email}
          autoComplete="email"
          readOnly
        />

        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-400">{success}</p> : null}

        <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-4 py-4">
          <p className="text-sm text-[var(--text-secondary)]">Keep this aligned with the identity you want reflected in alerts and account views.</p>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Save profile"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
