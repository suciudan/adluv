"use client";

import { useState, useTransition } from "react";

import type { UserNotificationSettingsSummary } from "@adluv/db";

import { updateNotificationSettingsAction } from "../app/actions/notifications";
import {
  formatDigestFrequencyLabel,
  formatNotificationChannelLabel,
  formatNotificationStatusLabel,
} from "../lib/notification-settings";
import { AppButton, cn } from "./app-ui";

type SettingsResponse =
  | {
      status: "ok";
      settings: UserNotificationSettingsSummary;
    }
  | {
      status: "error";
      message: string;
    };

function ToggleRow(props: {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-4 py-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{props.label}</p>
        <p className="text-sm leading-6 text-[var(--text-secondary)]">{props.description}</p>
      </div>
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-violet-500 focus:ring-violet-500"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.checked)}
      />
    </label>
  );
}

export function NotificationSettingsForm({
  initialSettings,
}: {
  initialSettings: UserNotificationSettingsSummary;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">Current status</p>
        <h2 className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{formatNotificationStatusLabel(settings)}</h2>
        <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
          Preferences are stored separately from workspace access limits. Current channel selection:{" "}
          <span className="font-semibold text-[var(--text-primary)]">{formatNotificationChannelLabel(settings)}</span>.
        </p>
        {!settings.alertsPlanEnabled ? (
          <p className="mt-3 text-sm text-amber-300">
            Notification delivery is currently disabled for this workspace. You can still save preferences now and they
            will apply when notifications are re-enabled.
          </p>
        ) : null}
      </div>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();

          startTransition(async () => {
            try {
              setError(null);
              setSuccess(null);

              const payload = (await updateNotificationSettingsAction({
                alertsEnabled: settings.alertsEnabled,
                emailEnabled: settings.emailEnabled,
                inAppEnabled: settings.inAppEnabled,
                digestFrequency: settings.digestFrequency,
              })) as SettingsResponse;

              if (payload.status === "error") {
                throw new Error(payload.status === "error" ? payload.message : "Unable to update notification settings.");
              }

              setSettings(payload.settings);
              setSuccess("Settings saved.");
            } catch (updateError) {
              setError(updateError instanceof Error ? updateError.message : "Unable to update notification settings.");
            }
          });
        }}
      >
        <ToggleRow
          checked={settings.alertsEnabled}
          label="Notifications enabled"
          description="Turn this off to stop all new notification delivery while keeping your saved channel preferences intact."
          onChange={(checked) => {
            setSettings((current) => ({
              ...current,
              alertsEnabled: checked,
            }));
          }}
        />

        <ToggleRow
          checked={settings.emailEnabled}
          label="Email notifications"
          description="Use email as a channel, then decide below whether it sends immediately or as a consolidated digest."
          onChange={(checked) => {
            setSettings((current) => ({
              ...current,
              emailEnabled: checked,
            }));
          }}
        />

        <label className="block space-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-4 py-4">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Email frequency</span>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">
            Instant sends one email per new ad. Daily, weekly, and monthly group watchlist activity by advertiser.
          </p>
          <select
            value={settings.digestFrequency}
            disabled={!settings.emailEnabled}
            onChange={(event) => {
              setSettings((current) => ({
                ...current,
                digestFrequency: event.target.value as UserNotificationSettingsSummary["digestFrequency"],
              }));
            }}
            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="instant">Instant</option>
            <option value="daily">Daily digest</option>
            <option value="weekly">Weekly digest</option>
            <option value="monthly">Monthly digest</option>
          </select>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">
            Current mode: {formatDigestFrequencyLabel(settings.digestFrequency)}
          </p>
        </label>

        <ToggleRow
          checked={settings.inAppEnabled}
          label="In-app notifications"
          description="Keep new notifications available inside adluv for the archive and future review surfaces."
          onChange={(checked) => {
            setSettings((current) => ({
              ...current,
              inAppEnabled: checked,
            }));
          }}
        />

        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-400">{success}</p> : null}

        <div className="flex flex-col gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[var(--text-secondary)]">
            Effective delivery after save: <span className="font-semibold text-[var(--text-primary)]">{formatNotificationStatusLabel(settings)}</span>
          </p>
          <AppButton
            type="submit"
            variant="primary"
            disabled={isPending}
            className={cn("shrink-0", isPending && "cursor-wait opacity-70")}
          >
            {isPending ? "Saving..." : "Save settings"}
          </AppButton>
        </div>
      </form>
    </div>
  );
}
