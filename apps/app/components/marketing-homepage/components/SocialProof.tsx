import { motion } from "motion/react";
import { Briefcase, Building2, Megaphone, Rocket, Target, TrendingUp } from "lucide-react";

const badges = [
  { label: "SaaS", icon: Rocket },
  { label: "Agencies", icon: Building2 },
  { label: "Demand Gen", icon: TrendingUp },
  { label: "Paid Social", icon: Target },
  { label: "B2B Startups", icon: Megaphone },
  { label: "Consultants", icon: Briefcase },
];

export function SocialProof() {
  return (
    <section id="product" className="py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6 text-center">
        <motion.span
          className="text-violet-400"
          style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const }}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          Built for teams who live in LinkedIn Ads
        </motion.span>
        <motion.h2
          className="mx-auto mt-4 max-w-2xl text-4xl text-white md:text-5xl"
          style={{ lineHeight: 1.15 }}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
        >
          Made for SaaS marketers, agencies, and B2B growth teams
        </motion.h2>
        <motion.p
          className="mx-auto mt-4 max-w-xl text-zinc-400"
          style={{ fontSize: 16, lineHeight: 1.7 }}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.15 }}
        >
          From weekly competitor checks to campaign kickoff research, Adluv is designed for the people who
          need LinkedIn ad examples at their fingertips.
        </motion.p>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
          {badges.map((badge, i) => (
            <motion.div
              key={badge.label}
              className="flex items-center gap-2.5 rounded-full border border-white/8 bg-white/[0.03] px-5 py-2.5"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 + i * 0.05 }}
            >
              <badge.icon size={16} className="text-violet-400" />
              <span className="text-zinc-300" style={{ fontSize: 14, fontWeight: 500 }}>
                {badge.label}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
