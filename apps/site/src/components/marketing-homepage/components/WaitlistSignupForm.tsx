"use client";

import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";

type WaitlistSignupFormProps = {
  className?: string;
  formClassName?: string;
  inputClassName?: string;
  buttonClassName?: string;
  successClassName?: string;
  inputPlaceholder?: string;
  buttonLabel?: string;
};

type SubmitState = "idle" | "submitting" | "success";

export function WaitlistSignupForm({
  className,
  formClassName,
  inputClassName,
  buttonClassName,
  successClassName,
  inputPlaceholder = "Enter your work email",
  buttonLabel = "Get Early Access",
}: WaitlistSignupFormProps) {
  const [email, setEmail] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextEmail = email.trim().toLowerCase();
    if (!nextEmail) {
      return;
    }

    setState("submitting");
    setError("");

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: nextEmail,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { message?: string; email?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to join the waitlist right now.");
      }

      setSubmittedEmail(payload?.email ?? nextEmail);
      setState("success");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Unable to join the waitlist right now.");
      setState("idle");
    }
  }

  if (state === "success") {
    return (
      <div
        className={successClassName ?? "mt-8 flex flex-col items-center text-center"}
        aria-live="polite"
      >
        <div className="flex size-10 items-center justify-center rounded-full border-3 border-emerald-500/95">
          <Check className="size-4 text-emerald-500" strokeWidth={2.8} />
        </div>
        <p className="mt-4 text-balance text-xl font-medium leading-tight text-white">
          Successfully joined the waitlist!
        </p>
        <p className="mt-3 break-all text-base text-zinc-400">{submittedEmail}</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <form onSubmit={handleSubmit} className={formClassName}>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={inputPlaceholder}
          required
          autoComplete="email"
          disabled={state === "submitting"}
          className={inputClassName}
        />
        <button type="submit" disabled={state === "submitting"} className={buttonClassName}>
          {state === "submitting" ? "Joining..." : buttonLabel}
          <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </form>
      {error ? (
        <p className="mt-3 text-sm text-rose-300" aria-live="polite">
          {error}
        </p>
      ) : null}
    </div>
  );
}
