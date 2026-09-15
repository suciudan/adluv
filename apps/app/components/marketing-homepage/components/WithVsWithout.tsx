import { motion } from "motion/react";

const withoutItems = [
  "Time wasted searching for relevant ads",
  "Ideas lost across tabs and screenshots",
  "Competitor tracking is inconsistent",
  "Teams repeat research from scratch",
  "No alerts for new ad launches",
  "No clear visibility into trends or patterns",
];

const withItems = [
  "Instantly find ads across any brand",
  "Save and organize ads in one place",
  "Automatically track competitors and accounts",
  "Build on insights, not repeat work",
  "Get alerts when new ads launch",
  "See trends and performance across all ads",
];

function ListMarker({ variant }: { variant: "positive" | "negative" }) {
  const isPositive = variant === "positive";

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={isPositive ? "h-3 w-3 text-violet-400" : "h-3 w-3 text-red-400"}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      {isPositive ? <path d="M3.5 8.5 6.5 11.5 12.5 5.5" /> : <path d="m4.5 4.5 7 7m0-7-7 7" />}
    </svg>
  );
}

export function WithVsWithout() {
  return (
    <section id="with-vs-without" className="py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <motion.span
            className="text-violet-400"
            style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const }}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            With vs Without AdLuv
          </motion.span>
          <motion.h2
            className="mt-4 text-4xl text-white md:text-5xl"
            style={{ lineHeight: 1.15 }}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            Stop wasting hours on manual ad research
          </motion.h2>
        </div>

        <motion.div
          className="mx-auto mt-14 grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-2"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
        >
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-8">
            <h3 className="text-xl text-zinc-400" style={{ fontWeight: 600 }}>
              Without AdLuv
            </h3>
            <ul className="mt-6 space-y-4">
              {withoutItems.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/10">
                    <ListMarker variant="negative" />
                  </div>
                  <span className="text-zinc-400" style={{ fontSize: 14, lineHeight: 1.6 }}>
                    {item}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-8 border-t border-white/5 pt-6">
              <span className="text-zinc-500" style={{ fontSize: 12, fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
                Time lost per week
              </span>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-3xl text-red-400" style={{ fontWeight: 700 }}>
                  5-10
                </span>
                <span className="text-red-400/70" style={{ fontSize: 14, fontWeight: 500 }}>
                  hours wasted
                </span>
              </div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                <motion.div
                  className="h-full rounded-full bg-red-500/40"
                  initial={{ width: 0 }}
                  whileInView={{ width: "75%" }}
                  viewport={{ once: true }}
                  transition={{ duration: 1, delay: 0.4, ease: "easeOut" }}
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.03] p-8">
            <h3 className="text-xl text-white" style={{ fontWeight: 600 }}>
              With AdLuv
            </h3>
            <ul className="mt-6 space-y-4">
              {withItems.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/10">
                    <ListMarker variant="positive" />
                  </div>
                  <span className="text-zinc-300" style={{ fontSize: 14, lineHeight: 1.6 }}>
                    {item}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-8 border-t border-violet-500/10 pt-6">
              <span className="text-zinc-500" style={{ fontSize: 12, fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
                Time saved per week
              </span>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-3xl text-violet-400" style={{ fontWeight: 700 }}>
                  5-10
                </span>
                <span className="text-violet-400/70" style={{ fontSize: 14, fontWeight: 500 }}>
                  hours saved
                </span>
              </div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                <motion.div
                  className="h-full rounded-full bg-violet-500/60"
                  initial={{ width: 0 }}
                  whileInView={{ width: "75%" }}
                  viewport={{ once: true }}
                  transition={{ duration: 1, delay: 0.4, ease: "easeOut" }}
                />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
