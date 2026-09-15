import { getAppHref } from "@adluv/config";
import type { Metadata } from "next";

import Link from "next/link";

import { Button, Card } from "@adluv/ui";

import { MarketingFrame } from "../../components/marketing-frame";
import { buildSiteMetadata } from "../metadata";

const included = [
  "Logged-in workspace with activity feed, watchlist, and swipe file",
  "Browse ads and advertisers with LinkedIn-specific filters",
  "Competitor alerts with inbox, instant email, and digest scheduling",
  "Landing-page capture plus ad detail context",
];

export const metadata: Metadata = buildSiteMetadata({
  title: "Private Beta Access | Adluv",
  description: "Private beta access for teams that want a focused LinkedIn competitor intelligence workflow.",
  path: "/access",
});

export default function AccessPage() {
  return (
    <MarketingFrame
      title="Private beta access for marketers who want competitor ad intelligence without a bloated rollout."
      lead="Adluv private beta is provisioned manually. Join the waitlist, tell us your workflow, and we will invite the teams that match the current launch scope."
    >
      <section className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
        <div className="space-y-5 rounded-[2rem] border border-white/10 bg-[#16120e] p-7">
          <p className="text-[11px] uppercase tracking-[0.26em] text-stone-500">Access model</p>
          <h2 className="text-3xl font-semibold tracking-[-0.04em] text-white">
            A focused beta for lean teams that still need serious monitoring.
          </h2>
          <p className="text-sm leading-7 text-stone-300">
            The current launch is intentionally narrow: LinkedIn-first tracking, operator-provisioned workspaces, and
            a hands-on onboarding loop while the product matures.
          </p>
          <div className="rounded-[1.5rem] border border-white/10 bg-[#110f0c] px-5 py-5">
            <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Current beta scope</p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-stone-200">
              {included.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid gap-6">
          <Card className="rounded-[2rem] border-white/10 bg-[#1b1712] p-8">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-6">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-amber-300/80">Private beta</p>
                <h3 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white">Request access</h3>
              </div>
              <div className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-amber-200">
                Manual onboarding
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-[1.5rem] border border-white/10 bg-[#120f0c] px-5 py-5">
                <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Best for</p>
                <p className="mt-3 text-sm leading-7 text-stone-200">
                  Growth marketers, founders, and agency strategists who need a repeatable LinkedIn competitor review
                  system.
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-white/10 bg-[#120f0c] px-5 py-5">
                <p className="text-xs uppercase tracking-[0.2em] text-stone-500">How access works</p>
                <p className="mt-3 text-sm leading-7 text-stone-200">
                  Join the waitlist, then receive a provisioned workspace with credentials once your use case matches
                  the current beta scope.
                </p>
              </div>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/#waitlist">
                <Button>Join the waitlist</Button>
              </Link>
              <Link href={getAppHref("/login")} className="text-sm font-semibold text-stone-200 underline">
                Already invited? Sign in
              </Link>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="rounded-[1.6rem] border-white/10 bg-[#12100d] p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-stone-500">No public checkout</p>
              <p className="mt-3 text-sm leading-7 text-stone-200">
                The beta is invitation-led while the team refines onboarding and support loops.
              </p>
            </Card>
            <Card className="rounded-[1.6rem] border-white/10 bg-[#12100d] p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Provisioned workspaces</p>
              <p className="mt-3 text-sm leading-7 text-stone-200">
                Every beta workspace is configured manually so the team can tune limits and onboarding per account.
              </p>
            </Card>
            <Card className="rounded-[1.6rem] border-white/10 bg-[#12100d] p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Launch-first scope</p>
              <p className="mt-3 text-sm leading-7 text-stone-200">
                No multi-platform intelligence, no AI analysis, and no public self-serve onboarding promises yet.
              </p>
            </Card>
          </div>
        </div>
      </section>
    </MarketingFrame>
  );
}
