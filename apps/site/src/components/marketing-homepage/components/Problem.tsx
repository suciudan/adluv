import { motion } from "motion/react";
import { Clock, Eye, FolderOpen, RefreshCw } from "lucide-react";

const problems = [
  { icon: Clock, text: "Too much time spent digging for relevant examples" },
  { icon: FolderOpen, text: "Good ideas get lost in tabs and screenshots" },
  { icon: Eye, text: "Competitor monitoring becomes inconsistent" },
  { icon: RefreshCw, text: "Teams repeat the same research from scratch" },
];

export function Problem() {
  return (
    <section id="why-this-matters" className="relative py-20 md:py-28">
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <motion.span
              className="text-sm font-semibold uppercase tracking-[0.08em] text-violet-400"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              Why this matters
            </motion.span>
            <motion.h2
              className="mt-4 text-4xl leading-[1.15] text-white md:text-5xl"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              LinkedIn ad research is still more manual than it should be
            </motion.h2>
            <motion.p
              className="mt-5 text-[16px] leading-[1.8] text-zinc-400"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.15 }}
            >
              The public ad library is useful, but real research still happens across open tabs, screenshots,
              bookmarks, Slack threads, and half-remembered campaigns. The result is slow research, messy
              handoffs, and repeated work every time a new campaign starts.
            </motion.p>
            <motion.p
              className="mt-8 text-[15px] font-medium text-violet-400"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 }}
            >
              Adluv turns LinkedIn ad research into a repeatable system.
            </motion.p>
          </div>

          <div className="relative pl-6 lg:pt-4">
            <motion.div
              className="absolute bottom-0 left-0 top-0 w-px bg-red-500/30"
              initial={{ scaleY: 0, originY: 0 }}
              whileInView={{ scaleY: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.2 }}
            />

            <div className="space-y-8">
              {problems.map((problem, i) => (
                <motion.div
                  key={problem.text}
                  className="relative flex items-start gap-4"
                  initial={{ opacity: 0, x: 16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.25 + i * 0.1 }}
                >
                  <div className="absolute -left-6 top-1.5 flex h-3 w-3 -translate-x-1/2 items-center justify-center">
                    <span className="h-2 w-2 rounded-full bg-red-400/70" />
                  </div>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
                    <problem.icon size={16} className="text-red-400" />
                  </div>
                  <p className="pt-1 text-[15px] leading-[1.6] text-zinc-300">
                    {problem.text}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
