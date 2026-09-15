import { motion } from "motion/react";
import { Bookmark, Search, SlidersHorizontal, Zap } from "lucide-react";

const steps = [
  {
    icon: Search,
    num: "01",
    title: "Search the market",
    desc: "Enter a company name, keyword, or category you want to study.",
  },
  {
    icon: SlidersHorizontal,
    num: "02",
    title: "Narrow the signal",
    desc: "Filter down to the formats, countries, and timeframes that actually matter.",
  },
  {
    icon: Bookmark,
    num: "03",
    title: "Save what matters",
    desc: "Build collections for competitors, campaigns, and creative themes.",
  },
  {
    icon: Zap,
    num: "04",
    title: "Turn research into action",
    desc: "Use your shortlist to brief creative, plan tests, or review category trends.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-20 md:py-28">
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <motion.span
            className="text-sm font-semibold uppercase tracking-[0.08em] text-violet-400"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            How it works
          </motion.span>
          <motion.h2
            className="mt-4 text-4xl leading-[1.15] text-white md:text-5xl"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            From research question to creative brief in minutes
          </motion.h2>
        </div>

        <div className="relative mx-auto mt-16 max-w-2xl">
          <motion.div
            className="absolute bottom-0 left-5 top-0 w-px bg-violet-500/20 md:left-1/2 md:-translate-x-px"
            initial={{ scaleY: 0, originY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: 0.2 }}
          />

          <div className="space-y-12 md:space-y-16">
            {steps.map((step, i) => {
              const isRight = i % 2 !== 0;

              return (
                <motion.div
                  key={step.num}
                  className="relative flex items-start gap-6 md:block"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 + i * 0.12 }}
                >
                  <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-violet-500/30 bg-[#09090f] md:absolute md:left-1/2 md:top-0 md:-translate-x-1/2">
                    <step.icon size={16} className="text-violet-400" />
                  </div>

                  <div
                    className={`md:w-[calc(50%-2.5rem)] ${
                      isRight
                        ? "md:ml-[calc(50%+2.5rem)] md:text-left"
                        : "md:mr-[calc(50%+2.5rem)] md:text-right"
                    }`}
                  >
                    <span className="text-[12px] font-bold tracking-[0.1em] text-violet-400/50">
                      STEP {step.num}
                    </span>
                    <h3 className="mt-1 text-2xl text-white md:text-3xl">{step.title}</h3>
                    <p className="mt-2 text-[15px] leading-[1.7] text-zinc-400">
                      {step.desc}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
