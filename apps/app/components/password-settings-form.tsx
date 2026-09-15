"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Button, Card } from "@adluv/ui";

import { updatePasswordAction } from "../app/actions/account";

type PasswordResponse =
  | {
      status: "ok";
      message: string;
    }
  | {
      status: "error";
      message: string;
    };

function PasswordField(props: {
  autoComplete?: string;
  description?: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold text-[var(--text-primary)]">{props.label}</span>
      {props.description ? <p className="text-sm leading-6 text-[var(--text-secondary)]">{props.description}</p> : null}
      <span className="relative block">
        <input
          type={visible ? "text" : "password"}
          autoComplete={props.autoComplete}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--field-bg)] px-4 py-3 pr-12 text-sm text-[var(--text-primary)] outline-none transition focus:border-violet-500"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)]"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          <Icon size={18} strokeWidth={1.75} />
        </button>
      </span>
    </label>
  );
}

export function PasswordSettingsForm({ hasPassword }: { hasPassword: boolean }) {
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <Card className="rounded-md border-[var(--border-subtle)] bg-[var(--bg-surface-1)]">
      <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">Security</p>
      <h2 className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">Password rotation</h2>
      <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
        Change the Better Auth password used to access this workspace.
      </p>

      {!hasPassword ? (
        <div className="mt-6 rounded-2xl border border-[var(--pill-warning-border)] bg-[var(--pill-warning-bg)] px-4 py-4 text-sm text-[var(--pill-warning-text)]">
          This account does not have a password-based sign-in path yet.
        </div>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();

            startTransition(async () => {
              setError(null);
              setSuccess(null);

              const response = (await updatePasswordAction(form)) as PasswordResponse;

              if (response.status === "error") {
                setError(response.message);
                return;
              }

              setForm({
                currentPassword: "",
                newPassword: "",
              });
              setSuccess(response.message);
            });
          }}
        >
          <PasswordField
            label="Current password"
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={(value) => {
              setForm((current) => ({
                ...current,
                currentPassword: value,
              }));
            }}
          />

          <PasswordField
            label="New Password"
            autoComplete="new-password"
            description="Password must be 8 to 32 characters and be different from your current password."
            value={form.newPassword}
            onChange={(value) => {
              setForm((current) => ({
                ...current,
                newPassword: value,
              }));
            }}
          />

          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-400">{success}</p> : null}

          <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-4 py-4">
            <p className="text-sm text-[var(--text-secondary)]">Passwords are verified and updated directly through Better Auth.</p>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Updating..." : "Update password"}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
