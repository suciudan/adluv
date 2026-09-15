import { motion } from "motion/react";
import { ArrowRight, Bell, Building2, FolderHeart, GitCompare, Search, SlidersHorizontal, TrendingUp } from "lucide-react";
import { resolveCdnAssetUrl } from "@adluv/config";

import AsosLogo from "../../../../site/src/components/Brands/AsosLogo";
import BambooHrLogo from "../../../../site/src/components/Brands/BambooHrLogo";
import ElevenLabsLogo from "../../../../site/src/components/Brands/ElevenLabsLogo";
import { ImageWithFallback } from "./ImageWithFallback";
import GoogleAdsLogo from "../../../../site/src/components/Brands/GoogleAdsLogo";
import KingLogo from "../../../../site/src/components/Brands/KingLogo";
import MetaLogo from "../../../../site/src/components/Brands/MetaLogo";
import SmartSheetLogo from "../../../../site/src/components/Brands/SmartSheetLogo";
import SupabaseLogo from "../../../../site/src/components/Brands/SupabaseLogo";
import VercelLogo from "../../../../site/src/components/Brands/VercelLogo";
import WayfairLogo from "../../../../site/src/components/Brands/WayfairLogo";
import ZendeskLogo from "../../../../site/src/components/Brands/ZendeskLogo";
import ZScalerLogo from "../../../../site/src/components/Brands/ZScalerLogo";
import ZuoraLogo from "../../../../site/src/components/Brands/ZuoraLogo";

const features = [
  {
    icon: Search,
    title: "One place. All Ads.",
    desc: "Stop jumping between tools. See relevant ads across Meta, Google, LinkedIn, and beyond in a single view.",
    image: "https://images.unsplash.com/photo-1762216453978-480d8505e9ad?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx1bmlmaWVkJTIwZGFzaGJvYXJkJTIwYWRzJTIwb3ZlcnZpZXd8ZW58MXx8fHwxNzc0NDU4NTI0fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
  },
  {
    icon: Building2,
    title: "Track any company",
    desc: "Monitor competitors and target accounts to spot ad and landing page trends, activity, and strategic moves.",
    image: "https://images.unsplash.com/photo-1657727534685-36b09f84e193?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb21wYW55JTIwdHJhY2tpbmclMjBjb21wZXRpdG9yJTIwbW9uaXRvcmluZ3xlbnwxfHx8fDE3NzQ0NTg1MjV8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
  },
  {
    icon: Bell,
    title: "Receive instant alerts",
    desc: "Get notified when tracked companies launch new ads with real-time, daily, or weekly alerts via email or Slack.",
    image: "https://images.unsplash.com/photo-1761625501365-ab081f5cbd7a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxub3RpZmljYXRpb24lMjBhbGVydCUyMGJlbGwlMjBtb2JpbGV8ZW58MXx8fHwxNzc0NDU4NTI1fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
  },
  {
    icon: TrendingUp,
    title: "View performance and trends",
    desc: "Quickly see what’s working (and what’s not) across channels, creatives, landing pages, and how long ads run.",
    image: "https://images.unsplash.com/photo-1758691736483-5f600b509962?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXRhJTIwYW5hbHl0aWNzJTIwcGVyZm9ybWFuY2UlMjBjaGFydCUyMHNjcmVlbnxlbnwxfHx8fDE3NzQ0NTg1MjV8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
  },
  {
    icon: FolderHeart,
    title: "Save and organize ads",
    desc: "Save your favorite ads, organize them into collections, and easily filter and share with your team.",
    image: "https://images.unsplash.com/photo-1634833650314-ed773bcc5b23?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxvcmdhbml6aW5nJTIwYm9va21hcmtzJTIwZm9sZGVycyUyMGRpZ2l0YWx8ZW58MXx8fHwxNzc0NDU4NTI2fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
  },
  {
    icon: GitCompare,
    title: "Benchmark and compare",
    desc: "Compare companies side by side to understand differences in strategy across time, platforms, and creatives.",
    image: "https://images.unsplash.com/photo-1614889440242-9b4200478f69?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb21wYXJpc29uJTIwYmVuY2htYXJrJTIwc2lkZSUyMGJ5JTIwc2lkZXxlbnwxfHx8fDE3NzQ0NTg1MjZ8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
  },
];

const featuredAds = [
  {
    title: "Not your average Cyber Monday haul",
    image: resolveCdnAssetUrl("/ad-assets/9ed6a31947b567147574690f997c618b4c5c4626.webp") ?? "",
    mediaClassName: "aspect-video",
    imageClassName: "object-cover object-center",
  },
  {
    title: "Vercel at AWS re:Invent 2025",
    image: resolveCdnAssetUrl("/ad-assets/c8ad5f3eac67701e351f597fb1538b26fc421075.webp") ?? "",
    mediaClassName: "aspect-video",
    imageClassName: "object-cover object-center",
  },
  {
    title: "Ship a production-ready AI agent",
    image: resolveCdnAssetUrl("/ad-assets/054110557f3837e7ce2fb99804ec00d5f85b20f1.webp") ?? "",
    mediaClassName: "aspect-square",
    imageClassName: "object-cover object-top",
  },
  {
    title: "Webinar: How to migrate to Next.js 16",
    image: resolveCdnAssetUrl("/ad-assets/161dfbfd9b96bca06777dd019866de2bd9b1fe34.webp") ?? "",
    mediaClassName: "aspect-square",
    imageClassName: "object-cover object-top",
  },
  {
    title: "Calculate your potential Black Friday revenue loss now",
    image: resolveCdnAssetUrl("/ad-assets/a616c0480f48dd1a0851283b76b2915469bcd297.webp") ?? "",
    mediaClassName: "aspect-square",
    imageClassName: "object-cover object-top",
  },
  {
    title: "The Future of Agentic AI at AWS re:Invent",
    image: resolveCdnAssetUrl("/ad-assets/5407d415b07bb7ffb94dd148370c043283c1a87b.webp") ?? "",
    mediaClassName: "aspect-square",
    imageClassName: "object-cover object-center",
  },
];

const advertiserCards = [
  { name: "ASOS", source: "Meta", category: "Retail", totalAds: 50, activeAds: 47, logo: AsosLogo, logoClassName: "h-5 w-auto max-w-full text-white" },
  { name: "King", source: "Meta", category: "Gaming", totalAds: 46, activeAds: 46, logo: KingLogo, logoClassName: "h-5 w-auto max-w-full" },
  { name: "Wayfair", source: "Meta", category: "Ecommerce", totalAds: 47, activeAds: 37, logo: WayfairLogo, logoClassName: "h-5 w-auto max-w-full text-[#ff7a00]" },
  { name: "ElevenLabs", source: "Meta", category: "SaaS", totalAds: 50, activeAds: 31, logo: ElevenLabsLogo, logoClassName: "h-5 w-auto max-w-full text-white" },
  { name: "Smartsheet", source: "Meta", category: "SaaS", totalAds: 50, activeAds: 30, logo: SmartSheetLogo, logoClassName: "h-5 w-auto max-w-full text-[#0f8b6d]" },
  { name: "BambooHR", source: "Meta", category: "SaaS", totalAds: 50, activeAds: 28, logo: BambooHrLogo, logoClassName: "h-4 w-auto max-w-full text-[#8bdc00]" },
  { name: "Zuora", source: "LinkedIn", category: "SaaS", totalAds: 43, activeAds: 24, logo: ZuoraLogo, logoClassName: "h-4 w-auto max-w-full text-[#2cccd3]" },
  { name: "Zscaler", source: "LinkedIn", category: "Security", totalAds: 44, activeAds: 26, logo: ZScalerLogo, logoClassName: "h-4 w-auto max-w-full text-[#1ea7ff]" },
  { name: "Zendesk", source: "LinkedIn", category: "Support", totalAds: 39, activeAds: 19, logo: ZendeskLogo, logoClassName: "h-4 w-auto max-w-full text-[#f4dd84]" },
];

function UnifiedAdsVisual() {
  const adColumns = [
    [featuredAds[0], featuredAds[3]],
    [featuredAds[1], featuredAds[4]],
    [featuredAds[2], featuredAds[5]],
  ];

  const renderAdCard = (ad: (typeof featuredAds)[number]) => (
    <div className="shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/70">
      <div className={`w-full overflow-hidden bg-zinc-950 ${ad.mediaClassName}`}>
        <ImageWithFallback src={ad.image} alt={ad.title} className={`h-full w-full ${ad.imageClassName}`} />
      </div>

      <div className="space-y-2 px-3 py-3">
        <p className="line-clamp-2 min-h-[2.5rem] text-[11px] font-medium leading-5 text-zinc-300 sm:text-xs">
          {ad.title}
        </p>
        <div className="flex items-center gap-2 pt-0.5">
          <div className="h-2 w-10 rounded-full bg-violet-500/50" />
          <div className="h-1 w-1 rounded-full bg-zinc-600" />
          <div className="h-2 w-7 rounded-full bg-white/8" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="aspect-[4/3] w-full bg-zinc-950">
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex h-14 items-center justify-between border-b border-white/10 px-4 sm:px-5">
          <div className="flex items-center gap-2 text-sm text-zinc-300 sm:text-base">
            <span className="font-medium text-zinc-200">Vercel</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-400">24 ads</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center sm:h-9 sm:w-9" title="Meta">
              <svg viewBox="0 0 36 36" fill="#0081FB" className="h-4 w-4">
                <path d="M8.143 0C3.886 0 .93 3.78.93 8.759c0 4.906 2.865 8.759 7.214 8.759 2.252 0 3.994-1.1 5.236-2.855l.057-.093.06.093c1.326 1.903 3.048 2.855 5.17 2.855 4.406 0 7.393-3.893 7.393-8.76C26.06 3.742 23.056 0 18.667 0c-2.14 0-3.88.975-5.23 2.855l-.06.093-.056-.093C12.119.97 10.378 0 8.143 0zm.16 3.39c1.215 0 2.27.724 3.228 2.217l1.033 1.609.322.502.322-.502 1.033-1.609c.958-1.493 2.013-2.217 3.228-2.217 2.583 0 4.176 2.487 4.176 5.37 0 2.921-1.632 5.368-4.176 5.368-1.215 0-2.27-.724-3.228-2.217l-1.033-1.609-.322-.502-.322.502-1.033 1.609c-.958 1.493-2.013 2.217-3.228 2.217-2.583 0-4.176-2.487-4.176-5.369 0-2.921 1.632-5.369 4.176-5.369z" />
              </svg>
            </span>
            <span className="flex h-8 w-8 items-center justify-center sm:h-9 sm:w-9" title="LinkedIn">
              <svg viewBox="0 0 24 24" fill="#0A66C2" className="h-4 w-4">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </span>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-3 gap-3 overflow-hidden p-3 sm:p-4">
          {adColumns.map((column, columnIndex) => (
            <div key={columnIndex} className="flex min-h-0 flex-col gap-3">
              {column.map((ad) => (
                <div key={ad.title}>{renderAdCard(ad)}</div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TrackAnyCompanyVisual() {
  return (
    <div className="aspect-[4/3] w-full bg-zinc-950">
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex h-14 items-center border-b border-white/10 px-4 sm:px-5">
          <div className="flex items-center gap-2 text-sm text-zinc-300 sm:text-base">
            <span className="font-medium text-zinc-200">Advertisers</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-400">100 found</span>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-3 gap-3 overflow-hidden p-4">
          {advertiserCards.map((advertiser) => (
            <div key={advertiser.name} className="rounded-2xl border border-white/10 bg-zinc-900/80 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-zinc-950/90 p-1.5">
                  <advertiser.logo className={advertiser.logoClassName} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-100">{advertiser.name}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">{advertiser.category}</p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">Total Ads</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-100">{advertiser.totalAds}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">Active Ads</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-100">{advertiser.activeAds}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReceiveInstantAlertsVisual() {
  const alertCards = [
    {
      label: "Real-time alert",
      title: "Vercel launched 3 new ads",
      meta: "2 min ago • Meta + LinkedIn",
      tone: "bg-violet-500",
    },
    {
      label: "Daily digest",
      title: "7 tracked companies had new activity",
      meta: "Sent at 08:00 • Email digest",
      tone: "bg-emerald-500",
    },
    {
      label: "Weekly summary",
      title: "Top movers: ElevenLabs, Brex, dbt Labs",
      meta: "Every Monday • Slack recap",
      tone: "bg-sky-500",
    },
  ];

  return (
    <div className="aspect-[4/3] w-full bg-zinc-950">
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex h-14 items-center justify-between border-b border-white/10 px-4 sm:px-5">
          <div className="flex items-center gap-2 text-sm text-zinc-300 sm:text-base">
            <span className="font-medium text-zinc-200">Alerts</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-400">Live delivery</span>
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="rounded-full border border-white/10 bg-zinc-900 px-3 py-1.5">Email</span>
            <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-violet-200">Slack</span>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-[1.4fr_0.9fr] gap-3 overflow-hidden p-4">
          <div className="flex h-full flex-col gap-3">
            {alertCards.map((alert) => (
              <div key={alert.title} className="flex-1 rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
                <div className="flex items-start gap-3">
                  <div className={`mt-1 h-2.5 w-2.5 rounded-full ${alert.tone}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium uppercase text-zinc-500">{alert.label}</p>
                    <p className="mt-2 text-sm font-medium text-zinc-100">{alert.title}</p>
                    <p className="mt-1 text-xs text-zinc-400">{alert.meta}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
              <div>
                <div className="flex items-center gap-2">
                  <Bell size={16} className="text-violet-400" />
                  <p className="text-sm font-medium text-zinc-100">Delivery rules</p>
                </div>
                <p className="mt-1 text-xs text-zinc-400">Choose where alerts go</p>
              </div>

              <div className="mt-4 space-y-3">
                {[
                  { name: "New ads", enabled: true },
                  { name: "Landing pages", enabled: true },
                  { name: "Creative changes", enabled: false },
                ].map((rule) => (
                  <div key={rule.name} className="flex items-center justify-between rounded-xl border border-white/10 bg-zinc-950 px-3 py-2">
                    <span className="text-xs text-zinc-300">{rule.name}</span>
                    <span className={`h-2.5 w-2.5 rounded-full ${rule.enabled ? "bg-violet-500" : "bg-zinc-700"}`} />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
              <p className="text-sm font-medium text-zinc-100">Avg. alert time</p>
              <p className="mt-3 text-3xl font-semibold text-white">2m</p>
              <p className="mt-1 text-xs text-zinc-400">From launch to notification</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewPerformanceAndTrendsVisual() {
  const bars = [32, 38, 44, 41, 48, 56, 63, 59, 52, 61, 73, 68, 58, 66, 79, 72, 64, 69, 75, 70, 62, 67, 74, 81, 77, 69, 73, 84, 79, 71];
  const metrics = [
    { label: "Avg. run time", value: "18d" },
    { label: "Winning format", value: "Video" },
    { label: "CTR lift", value: "+24%" },
  ];

  return (
    <div className="aspect-[4/3] w-full bg-zinc-950">
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex h-14 items-center justify-between border-b border-white/10 px-4 sm:px-5">
          <div className="flex items-center gap-2 text-sm text-zinc-300 sm:text-base">
            <span className="font-medium text-zinc-200">Performance</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-400">30 day trend</span>
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-violet-200">Ads</span>
            <span className="rounded-full border border-white/10 bg-zinc-900 px-3 py-1.5">Landing pages</span>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-hidden px-4 pb-4 pt-4">
          <div>
            <p className="text-sm font-medium text-zinc-100">Snapshot</p>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {metrics.map((metric) => (
                <div key={metric.label} className="rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-3">
                  <p className="text-[11px] uppercase text-zinc-500">{metric.label}</p>
                  <p className="mt-1 text-lg font-semibold text-zinc-100">{metric.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-4">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-violet-400" />
                <p className="text-sm font-medium text-zinc-100">Top performer trend</p>
              </div>
              <p className="mt-1 text-xs text-zinc-400">Best performing creatives over time</p>
            </div>

            <div className="mt-5">
              <div className="relative px-1 pt-2">
                <div className="pointer-events-none absolute inset-x-1 top-2 bottom-10 flex flex-col justify-between">
                  {[0, 1, 2].map((line) => (
                    <div key={line} className="border-t border-dashed border-white/7" />
                  ))}
                </div>

                <div className="relative z-10 flex h-[116px] items-end gap-1.5">
                  {bars.map((height, index) => (
                    <div key={index} className="flex h-full flex-1 items-end justify-center">
                      <div
                        className="w-full max-w-3 rounded-t-full bg-gradient-to-t from-violet-500 to-violet-300/80"
                        style={{ height: `${height}%` }}
                      />
                    </div>
                  ))}
                </div>

                <div className="absolute inset-x-1 bottom-10 border-t border-white/10" />
              </div>

              <div className="mt-2 flex items-start gap-1.5 px-1">
                {bars.map((_, index) => (
                  <div key={index} className="flex flex-1 justify-center">
                    <span className="origin-center -rotate-90 text-[8px] leading-none text-zinc-500">{index + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SaveAndOrganizeAdsVisual() {
  const collections = [
    { name: "Winning hooks", count: 18, accent: "bg-violet-500" },
    { name: "Landing pages", count: 9, accent: "bg-sky-500" },
    { name: "Q2 swipe file", count: 26, accent: "bg-emerald-500" },
  ];

  const savedAds = [
    { title: "Not your average Cyber Monday haul", meta: "Saved from Vercel", tags: ["Video", "B2B"], image: featuredAds[0].image },
    { title: "Vercel at AWS re:Invent 2025", meta: "Added to Winning hooks", tags: ["Event", "Meta"], image: featuredAds[1].image },
    { title: "Ship a production-ready AI agent", meta: "Shared with Growth", tags: ["UGC", "Promo"], image: featuredAds[2].image },
    { title: "Webinar: How to migrate to Next.js 16", meta: "Added to Landing pages", tags: ["Search", "SaaS"], image: featuredAds[3].image },
  ];

  return (
    <div className="aspect-[4/3] w-full bg-zinc-950">
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex h-14 items-center justify-between border-b border-white/10 px-4 sm:px-5">
          <div className="flex items-center gap-2 text-sm text-zinc-300 sm:text-base">
            <span className="font-medium text-zinc-200">Collections</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-400">53 saved ads</span>
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-violet-200">Favorites</span>
            <span className="rounded-full border border-white/10 bg-zinc-900 px-3 py-1.5">Shared</span>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-[0.9fr_1.4fr] gap-3 overflow-hidden p-4">
          <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-4">
            <div>
              <p className="text-sm font-medium text-zinc-100">Folders</p>
              <p className="mt-1 text-xs text-zinc-400">Group ads by angle or team</p>
            </div>

            <div className="mt-4 space-y-3">
              {collections.map((collection) => (
                <div key={collection.name} className="rounded-xl border border-white/10 bg-zinc-950/80 p-3">
                  <div className="flex items-center gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full ${collection.accent}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-zinc-200">
                        {collection.name} <span className="text-zinc-500">({collection.count})</span>
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-zinc-950/50 p-3">
              <p className="text-[11px] uppercase text-zinc-500">Quick filters</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {["UGC", "Video", "Meta", "LinkedIn"].map((tag) => (
                  <span key={tag} className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-zinc-400">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-4">
            <div>
              <p className="text-sm font-medium text-zinc-100">Saved ads</p>
              <p className="mt-1 text-xs text-zinc-400">Keep top creatives within reach</p>
            </div>

            <div className="mt-4 space-y-3">
              {savedAds.map((ad) => (
                <div key={ad.title} className="flex items-stretch gap-3 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 p-3">
                  <div className="w-28 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-zinc-950">
                    <ImageWithFallback src={ad.image} alt={ad.title} className="aspect-[4/3] h-full w-full object-cover object-center" />
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col justify-between">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-xs font-medium text-zinc-200">{ad.title}</p>
                      <p className="mt-1 text-[11px] text-zinc-500">{ad.meta}</p>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {ad.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-zinc-400">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BenchmarkAndCompareVisual() {
  const leftCompany = {
    name: "Vercel",
    ads: 24,
    logo: VercelLogo,
    logoClassName: "h-4 w-auto max-w-full text-white",
    active: 18,
    channels: [
      { label: "Meta", value: 82, tone: "bg-violet-500" },
      { label: "LinkedIn", value: 64, tone: "bg-sky-500" },
      { label: "Search", value: 41, tone: "bg-emerald-500" },
    ],
  };

  const rightCompany = {
    name: "Supabase",
    ads: 19,
    logo: SupabaseLogo,
    logoClassName: "h-5 w-auto max-w-full",
    active: 11,
    channels: [
      { label: "Meta", value: 57, tone: "bg-violet-500" },
      { label: "LinkedIn", value: 46, tone: "bg-sky-500" },
      { label: "Search", value: 38, tone: "bg-emerald-500" },
    ],
  };

  const CompanyCard = ({
    company,
  }: {
    company: typeof leftCompany;
  }) => (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-zinc-950/90 p-1.5">
          <company.logo className={company.logoClassName} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-100">{company.name}</p>
          <p className="mt-1 text-xs text-zinc-500">{company.ads} ads tracked</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-3">
          <p className="text-[10px] uppercase text-zinc-500">Active</p>
          <p className="mt-1 text-lg font-semibold text-zinc-100">{company.active}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-3">
          <p className="text-[10px] uppercase text-zinc-500">Top channel</p>
          <p className="mt-1 text-lg font-semibold text-zinc-100">{company.channels[0].label}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {company.channels.map((channel) => (
          <div key={channel.label}>
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span>{channel.label}</span>
              <span>{channel.value}%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-white/5">
              <div className={`h-2 rounded-full ${channel.tone}`} style={{ width: `${channel.value}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="aspect-[4/3] w-full bg-zinc-950">
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex h-14 items-center justify-between border-b border-white/10 px-4 sm:px-5">
          <div className="flex items-center gap-2 text-sm text-zinc-300 sm:text-base">
            <span className="font-medium text-zinc-200">Compare</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-400">2 advertisers</span>
          </div>

          <div className="flex items-center gap-4 text-xs text-zinc-400">
            <span className="flex items-center gap-3">
              <span className="flex items-center justify-center" title="Google Ads">
                <GoogleAdsLogo className="h-4 w-4" />
              </span>
              <span className="flex items-center justify-center" title="Meta">
                <MetaLogo className="h-4 w-4" />
              </span>
              <span className="flex items-center justify-center" title="LinkedIn">
                <svg viewBox="0 0 24 24" fill="#0A66C2" className="h-4 w-4">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </span>
            </span>
            <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-violet-200">30 days</span>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-2 gap-3 overflow-hidden p-4">
          <CompanyCard company={leftCompany} />
          <CompanyCard company={rightCompany} />
        </div>
      </div>
    </div>
  );
}

export function Features() {
  return (
    <section id="features" className="py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <motion.span
            className="text-violet-400"
            style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const }}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            Features
          </motion.span>
          <motion.h2
            className="mt-4 text-4xl text-white md:text-5xl"
            style={{ lineHeight: 1.15 }}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            Your go-to platform for ad intelligence
          </motion.h2>
          <motion.p
            className="mx-auto mt-4 max-w-xl text-zinc-400"
            style={{ fontSize: 16, lineHeight: 1.7 }}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 }}
          >
            Ads, advertisers, landing pages, and performance metrics &mdash; all structured in one place.
          </motion.p>
        </div>

        <div className="mt-16 flex flex-col gap-20 md:gap-28">
          {features.map((feature, index) => {
            const reversed = index % 2 !== 0;
            return (
              <motion.div
                key={feature.title}
                className="grid grid-cols-1 items-center gap-10 md:gap-16 lg:grid-cols-2"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <div className={reversed ? "lg:order-2" : ""}>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10">
                    <feature.icon size={22} className="text-violet-400" />
                  </div>
                  <h3 className="mt-4 text-2xl text-white md:text-3xl">{feature.title}</h3>
                  <p className="mt-3 max-w-lg text-zinc-400" style={{ fontSize: 16, lineHeight: 1.8 }}>
                    {feature.desc}
                  </p>
                  <a
                    href="#waitlist"
                    className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-transparent px-5 py-2.5 text-white transition-colors hover:border-violet-500/40 hover:bg-white/[0.03]"
                    style={{ fontSize: 14, fontWeight: 500 }}
                  >
                    Join Waitlist
                    <ArrowRight size={15} />
                  </a>
                </div>

                <div className={`overflow-hidden rounded-2xl border border-white/8 ${reversed ? "lg:order-1" : ""}`}>
                  {feature.title === "One place. All Ads." ? (
                    <UnifiedAdsVisual />
                  ) : feature.title === "Track any company" ? (
                    <TrackAnyCompanyVisual />
                  ) : feature.title === "Receive instant alerts" ? (
                    <ReceiveInstantAlertsVisual />
                  ) : feature.title === "View performance and trends" ? (
                    <ViewPerformanceAndTrendsVisual />
                  ) : feature.title === "Save and organize ads" ? (
                    <SaveAndOrganizeAdsVisual />
                  ) : feature.title === "Benchmark and compare" ? (
                    <BenchmarkAndCompareVisual />
                  ) : (
                    <ImageWithFallback src={feature.image} alt={feature.title} className="aspect-[4/3] w-full object-cover" />
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
