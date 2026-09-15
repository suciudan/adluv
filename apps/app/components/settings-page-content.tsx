"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

import type { AccountSettingsSummary, UserNotificationSettingsSummary, WorkspaceSummary } from "@adluv/db";

import { updatePasswordAction, updateProfileAction } from "../app/actions/account";
import { settingsSectionItems, type SettingsSectionId } from "../lib/settings-sections";
import { AppButton } from "./app-ui";
import { NotificationSettingsForm } from "./notification-settings-form";

type SettingsPageContentProps = {
  accountSummary: AccountSettingsSummary;
  activeSection: SettingsSectionId;
  notificationSettings: UserNotificationSettingsSummary;
  workspace: WorkspaceSummary;
};

type AccountDraft = {
  firstName: string;
  lastName: string;
  workEmail: string;
  username: string;
};

type PasswordDraft = {
  currentPassword: string;
  newPassword: string;
};

type SaveResponse =
  | {
      status: "ok";
    }
  | {
      status: "error";
      message: string;
    };

type PasswordResponse =
  | {
      status: "ok";
      message: string;
    }
  | {
      status: "error";
      message: string;
    };

function splitDisplayName(name: string | null) {
  const trimmed = (name ?? "").trim();

  if (!trimmed) {
    return {
      firstName: "",
      lastName: "",
    };
  }

  const parts = trimmed.split(/\s+/);

  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

function buildAccountDraft(accountSummary: AccountSettingsSummary): AccountDraft {
  const { firstName, lastName } = splitDisplayName(accountSummary.name);

  return {
    firstName,
    lastName,
    workEmail: accountSummary.email,
    username: accountSummary.username ?? "",
  };
}

function normalizeAccountDraft(draft: AccountDraft) {
  return {
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim(),
    workEmail: draft.workEmail.trim(),
    username: draft.username.trim(),
  };
}

function areAccountDraftsEqual(left: AccountDraft, right: AccountDraft) {
  const a = normalizeAccountDraft(left);
  const b = normalizeAccountDraft(right);

  return (
    a.firstName === b.firstName &&
    a.lastName === b.lastName &&
    a.workEmail === b.workEmail &&
    a.username === b.username
  );
}

function InputField(props: {
  autoComplete?: string;
  description?: string;
  label: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  disabled?: boolean;
  type?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-[var(--text-primary)]">{props.label}</span>
      {props.description ? <p className="text-sm leading-6 text-[var(--text-secondary)]">{props.description}</p> : null}
      <input
        type={props.type ?? "text"}
        autoComplete={props.autoComplete}
        readOnly={props.readOnly}
        disabled={props.disabled}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange?.(event.target.value)}
        className="app-input read-only:cursor-default read-only:bg-[var(--bg-surface-2)] read-only:text-[var(--text-tertiary)] disabled:cursor-not-allowed disabled:bg-[var(--bg-surface-2)] disabled:text-[var(--text-tertiary)] disabled:opacity-70"
      />
    </label>
  );
}

function PasswordInputField(props: {
  autoComplete?: string;
  description?: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-[var(--text-primary)]">{props.label}</span>
      {props.description ? <p className="mb-2 text-[13px] leading-5 text-[var(--text-secondary)]">{props.description}</p> : null}
      <span className="relative block">
        <input
          type={visible ? "text" : "password"}
          autoComplete={props.autoComplete}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          className="app-input pr-12"
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

export function SettingsPageContent({
  accountSummary,
  activeSection,
  notificationSettings,
  workspace,
}: SettingsPageContentProps) {
  const router = useRouter();
  const initialAccountRef = useRef(buildAccountDraft(accountSummary));

  const [accountDraft, setAccountDraft] = useState(initialAccountRef.current);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [referralCopied, setReferralCopied] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState<PasswordDraft>({
    currentPassword: "",
    newPassword: "",
  });
  const [isSaving, startSaving] = useTransition();
  const [isUpdatingPassword, startUpdatingPassword] = useTransition();

  useEffect(() => {
    if (!toastMessage) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setToastMessage(null);
    }, 3200);

    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  const accountDirty = !areAccountDraftsEqual(accountDraft, initialAccountRef.current);
  const referralUrl = `/?ref=${encodeURIComponent(accountSummary.username || workspace.slug)}`;
  const saveAccount = () => {
    startSaving(async () => {
      setSaveError(null);

      const responses: SaveResponse[] = [];

      if (accountDirty) {
        const name = [accountDraft.firstName.trim(), accountDraft.lastName.trim()].filter(Boolean).join(" ");

        responses.push(
          (await updateProfileAction({
            name,
            username: accountDraft.username.trim(),
          })) as SaveResponse,
        );
      }

      const failed = responses.find((response) => response.status === "error");

      if (failed?.status === "error") {
        setSaveError(failed.message);
        return;
      }

      const nextAccount = buildAccountDraft({
        ...accountSummary,
        name: [accountDraft.firstName.trim(), accountDraft.lastName.trim()].filter(Boolean).join(" "),
        username: accountDraft.username.trim(),
      });

      initialAccountRef.current = nextAccount;
      setAccountDraft(nextAccount);
      setToastMessage("Settings saved");
      router.refresh();
    });
  };

  return (
    <div className="relative space-y-8 pb-32">
      <section className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <nav className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-3 xl:sticky xl:top-24 xl:self-start">
          <div className="space-y-1">
            {settingsSectionItems.map((section) => {
              const active = activeSection === section.id;

              return (
                <Link
                  key={section.id}
                  href={`/w/${workspace.slug}/settings/${section.id}`}
                  className={[
                    "flex items-center justify-between rounded-2xl px-3 py-3 text-sm font-semibold transition",
                    active
                      ? "bg-[var(--accent-soft)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]",
                  ].join(" ")}
                >
                  <span>{section.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="space-y-6">
          {activeSection === "account" ? (
            <section
              id="account"
              className="scroll-mt-24 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-6"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-2">
                  <h2 className="text-[24px] font-semibold leading-[30px] text-[var(--text-primary)]">
                    Account
                  </h2>
                </div>
              </div>

              <form
                className="mt-6 max-w-xl space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveAccount();
                }}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <InputField
                    label="First name"
                    autoComplete="given-name"
                    value={accountDraft.firstName}
                    onChange={(value) => {
                      setAccountDraft((current) => ({
                        ...current,
                        firstName: value,
                      }));
                    }}
                  />
                  <InputField
                    label="Last name"
                    autoComplete="family-name"
                    value={accountDraft.lastName}
                    onChange={(value) => {
                      setAccountDraft((current) => ({
                        ...current,
                        lastName: value,
                      }));
                    }}
                  />
                </div>
                <InputField label="Work email" autoComplete="email" value={accountDraft.workEmail} readOnly disabled />
                <div className="flex justify-end pt-2">
                  <AppButton type="submit" variant="primary" disabled={isSaving || !accountDirty}>
                    {isSaving ? "Updating..." : "Update account"}
                  </AppButton>
                </div>
              </form>

              <div className="mt-6 max-w-xl border-t border-[var(--border-subtle)] pt-5">
                <h3 className="text-[15px] font-semibold leading-6 text-[var(--text-primary)]">Referral link</h3>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <input type="text" readOnly value={referralUrl} className="app-input min-w-0 flex-1" />
                  <AppButton
                    type="button"
                    variant="secondary"
                    onClick={async () => {
                      if (!referralUrl) {
                        return;
                      }

                      await navigator.clipboard.writeText(referralUrl);
                      setReferralCopied(true);
                      window.setTimeout(() => setReferralCopied(false), 1600);
                    }}
                  >
                    {referralCopied ? "Copied" : "Copy"}
                  </AppButton>
                </div>
              </div>
            </section>
          ) : null}

          {activeSection === "notifications" ? (
            <section
              id="notifications"
              className="scroll-mt-24 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-6"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-2">
                  <h2 className="text-[24px] font-semibold leading-[30px] text-[var(--text-primary)]">
                    Notifications
                  </h2>
                </div>
              </div>

              <div className="mt-6">
                <NotificationSettingsForm initialSettings={notificationSettings} />
              </div>
            </section>
          ) : null}

          {activeSection === "password" ? (
            <section
              id="password"
              className="scroll-mt-24 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-6"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-2">
                  <h2 className="text-[24px] font-semibold leading-[30px] text-[var(--text-primary)]">
                    Password
                  </h2>
                </div>
              </div>

              <div className="mt-6">
                {!accountSummary.hasPassword ? (
                  <p className="text-sm text-amber-200">
                    This account does not have a password-based sign-in path yet.
                  </p>
                ) : (
                  <form
                    className="max-w-xl space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();

                      startUpdatingPassword(async () => {
                        setPasswordError(null);
                        setPasswordSuccess(null);

                        const response = (await updatePasswordAction(passwordDraft)) as PasswordResponse;

                        if (response.status === "error") {
                          setPasswordError(response.message);
                          return;
                        }

                        setPasswordDraft({
                          currentPassword: "",
                          newPassword: "",
                        });
                        setPasswordSuccess(response.message);
                      });
                    }}
                  >
                    <div className="space-y-4">
                      <PasswordInputField
                        label="Current password"
                        autoComplete="current-password"
                        value={passwordDraft.currentPassword}
                        onChange={(value) => {
                          setPasswordDraft((current) => ({
                            ...current,
                            currentPassword: value,
                          }));
                        }}
                      />
                      <PasswordInputField
                        label="New Password"
                        autoComplete="new-password"
                        description="Password must be 8 to 32 characters and be different from your current password."
                        value={passwordDraft.newPassword}
                        onChange={(value) => {
                          setPasswordDraft((current) => ({
                            ...current,
                            newPassword: value,
                          }));
                        }}
                      />
                    </div>

                    {passwordError ? <p className="text-[13px] leading-5 text-[#fecaca]">{passwordError}</p> : null}
                    {passwordSuccess ? <p className="text-[13px] leading-5 text-[#a7f3d0]">{passwordSuccess}</p> : null}

                    <div className="flex justify-end pt-2">
                      <AppButton type="submit" variant="primary" disabled={isUpdatingPassword}>
                        {isUpdatingPassword ? "Updating..." : "Change password"}
                      </AppButton>
                    </div>
                  </form>
                )}
              </div>
            </section>
          ) : null}
        </div>
      </section>

      {saveError ? (
        <div className="rounded-[18px] border border-[rgba(239,68,68,0.22)] bg-[rgba(239,68,68,0.12)] px-4 py-4 text-[13px] leading-5 text-[#fecaca]">
          {saveError}
        </div>
      ) : null}

      {toastMessage ? (
        <div className="fixed bottom-28 right-5 z-50 rounded-[18px] border border-[rgba(16,185,129,0.22)] bg-[var(--bg-surface-1)] px-4 py-3 text-[13px] font-medium leading-5 text-[#a7f3d0] shadow-[var(--shadow-overlay)]">
          {toastMessage}
        </div>
      ) : null}
    </div>
  );
}
