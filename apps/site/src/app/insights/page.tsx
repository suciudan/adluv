import Link from "next/link";
import type { Metadata } from "next";

import { Card } from "@adluv/ui";

import { MarketingFrame } from "../../components/marketing-frame";
import { buildSiteMetadata } from "../metadata";

const insightColumns = [
  {
    label: "Why LinkedIn first",
    points: [
      "The MVP is deliberately narrow: LinkedIn only, invitation-led access, and logged-in operator workflows.",
      "That keeps the product aligned with the launch boundary instead of pretending to be a broad ad intelligence platform.",
      "It also matches the actual ingestion and review surfaces already built in the app.",
    ],
  },
  {
    label: "What buyers actually review",
    points: [
      "New creative launches and launch bursts",
      "Copy, CTA, ad duration, and engagement counts",
      "Landing-page context and saved swipe-file references",
    ],
  },
  {
    label: "What stays out",
    points: [
      "AI scoring or recommendations",
      "Multi-platform ingestion",
      "Enterprise permissions or team workflows",
    ],
  },
];

export const metadata: Metadata = buildSiteMetadata({
  title: "Insights | Adluv",
  description: "Product notes and operator insights on how Adluv approaches disciplined competitor ad intelligence.",
  path: "/insights",
});

export default function InsightsPage() {
  return (
    <MarketingFrame
      title="Product insights for a launch that stays disciplined about what adluv is and is not."
      lead="This page explains the product thesis in plain language: the value is not generic ad discovery, it is a private operating system for repeated LinkedIn competitor review."
    >
      <section className="grid gap-6 lg:grid-cols-3">
        {insightColumns.map((column) => (
          <Card key={column.label} className="rounded-[1.8rem] border-white/10 bg-[#16120e] p-6">
            <p className="text-[11px] uppercase tracking-[0.26em] text-stone-500">{column.label}</p>
            <ul className="mt-5 space-y-3 text-sm leading-7 text-stone-200">
              {column.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </Card>
        ))}
      </section>

      <section className="mt-12 grid gap-6 border-t border-white/10 pt-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <p className="text-[11px] uppercase tracking-[0.26em] text-stone-500">Operational lens</p>
          <h2 className="text-4xl font-semibold tracking-[-0.04em] text-white">Good competitor intelligence is a workflow problem before it is an analytics problem.</h2>
          <p className="text-sm leading-7 text-stone-300">
            Most marketers do not need a flood of abstract “insights.” They need a reliable way to notice new ads,
            inspect them quickly, and keep the examples worth revisiting. adluv is structured around exactly that
            sequence.
          </p>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-[#1b1712] p-7">
          <p className="text-[11px] uppercase tracking-[0.24em] text-stone-500">Launch checklist lens</p>
          <ul className="mt-5 space-y-4 text-sm leading-7 text-stone-200">
            <li>Search and watchlist flows must work end to end.</li>
            <li>Initial indexing and recurring sync have to surface new ads reliably.</li>
            <li>Alerts, swipe file, and settings have to feel coherent enough to support repeated weekly use.</li>
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/demo" className="text-sm font-semibold text-amber-300 underline">
              View the demo path
            </Link>
            <Link href="/#waitlist" className="text-sm font-semibold text-stone-200 underline">
              Join the waitlist
            </Link>
          </div>
        </div>
      </section>
    </MarketingFrame>
  );
}
