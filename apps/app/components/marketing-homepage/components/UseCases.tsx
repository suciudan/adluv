import { motion } from "motion/react";
import { Briefcase, Target, TrendingUp } from "lucide-react";

const cases = [
  {
    icon: TrendingUp,
    title: "Paid Social & Growth",
    desc: "Stay on top of competitor activity, discover winning creatives, and understand what is driving performance across your market.",
  },
  {
    icon: Briefcase,
    title: "Agencies & Consultants",
    desc: "Speed up audits, creative research, and strategy work for client accounts, then share structured findings instead of messy screenshots.",
  },
  {
    icon: Target,
    title: "ABM & GTM",
    desc: "Track target accounts and competitors across ads, landing pages, messaging, and ad activity over time to sharpen outreach and positioning.",
  },
];

export function UseCases() {
  return (
    <section id="use-cases" className="px-4 py-18 sm:px-6 sm:py-24">
      <div className="mx-auto w-[min(1200px,100%)]">
        <div className="mx-auto max-w-3xl text-center">
          <motion.span
            className="text-violet-300"
            style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const }}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            Use cases
          </motion.span>
          <motion.h2
            className="mt-4 text-4xl text-white md:text-5xl"
            style={{ lineHeight: 1.15 }}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            Built for marketing teams and agencies
          </motion.h2>
        </div>

        <div className="mt-16 grid gap-5 md:grid-cols-3">
          {cases.map((useCase, index) => (
            <motion.div
              key={useCase.title}
              className="group flex h-full flex-col rounded-[2rem] border border-white/8 bg-white/[0.03] p-8 transition-colors hover:border-violet-400/20 hover:bg-violet-400/[0.05]"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.05 }}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-400/10 text-violet-300 transition-colors group-hover:bg-violet-400/15">
                <useCase.icon size={20} />
              </div>
              <h3 className="mt-6 text-[2rem] leading-tight text-white">{useCase.title}</h3>
              <p className="mt-4 flex-1 text-[15px] leading-8 text-zinc-400">{useCase.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
