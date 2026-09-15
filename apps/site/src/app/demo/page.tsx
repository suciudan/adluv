import Link from "next/link";
import type { Metadata } from "next";

import { getAppHref } from "@adluv/config";
import { Button, Card } from "@adluv/ui";

import { MarketingFrame } from "../../components/marketing-frame";
import { buildSiteMetadata } from "../metadata";

const tourMoments = [
  {
    label: "Watchlist intake",
    title: "Search or paste a LinkedIn advertiser, then start tracking.",
    body: "The product resolves the advertiser identity first so the watchlist does not drift across duplicate company records.",
  },
  {
    label: "Activity review",
    title: "See launches, bursts, and engagement spikes in one feed.",
    body: "Feed events turn stored alerts into a review surface so you can jump directly into the ad or advertiser context that caused the signal.",
  },
  {
    label: "Creative inspection",
    title: "Open the ad, inspect the CTA, landing page, and variations.",
    body: "Each ad detail view connects the creative preview with copy, destination, engagement, and related ads from the same advertiser.",
  },
];

export const metadata: Metadata = buildSiteMetadata({
  title: "Demo | Adluv",
  description: "See how Adluv helps teams track competitors, review launches, and save the best creative in one workflow.",
  path: "/demo",
});

export default function DemoPage() {
  return (
    <MarketingFrame
      title="A product tour for teams who need competitor visibility without living in the ad library."
      lead="The demo page should explain the operator workflow clearly: identify the competitor, track it once, review new activity, and keep the best work inside a private swipe file."
    >
      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5 rounded-[2rem] border border-white/10 bg-[#17130f] p-7">
          <p className="text-[11px] uppercase tracking-[0.26em] text-stone-500">Guided flow</p>
          <h2 className="text-3xl font-semibold tracking-[-0.04em] text-white">Three product moves, one outcome: faster competitor review.</h2>
          <div className="mt-6 space-y-6">
            {tourMoments.map((moment, index) => (
              <div key={moment.label} className="grid gap-4 border-t border-white/10 pt-5 md:grid-cols-[72px_1fr]">
                <div className="text-4xl font-semibold tracking-[-0.05em] text-amber-300/90">0{index + 1}</div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-stone-500">{moment.label}</p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">{moment.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-stone-300">{moment.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <Card className="rounded-[1.8rem] border-white/10 bg-[#12100d] p-6">
            <p className="text-[11px] uppercase tracking-[0.24em] text-stone-500">Included surfaces</p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-stone-200">
              <li>Browse ads with engagement, CTA, and format filters</li>
              <li>Advertiser pages with recent launches and landing-page concentration</li>
              <li>Saved ads with notes and collections for swipe-file review</li>
              <li>Alert inbox plus instant, daily, or weekly email delivery</li>
            </ul>
          </Card>
          <Card className="rounded-[1.8rem] border-white/10 bg-[#12100d] p-6">
            <p className="text-[11px] uppercase tracking-[0.24em] text-stone-500">What happens after access is approved</p>
            <p className="mt-4 text-sm leading-7 text-stone-300">
              Beta access gives you a logged-in workspace with watchlist, activity feed, advertiser pages, alert
              controls, and saved creative review. It is intentionally focused on LinkedIn only.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/#waitlist">
                <Button>Join the waitlist</Button>
              </Link>
              <Link href={getAppHref("/login")} className="text-sm font-semibold text-stone-200 underline">
                Sign in to the workspace
              </Link>
            </div>
          </Card>
        </div>
      </section>
    </MarketingFrame>
  );
}
