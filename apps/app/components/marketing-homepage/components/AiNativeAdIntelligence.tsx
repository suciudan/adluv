import { motion } from "motion/react";

const prompt =
  "What creatives has Notion been running on LinkedIn or Meta this month?";

const responsePoints = [
  "12 active creatives indexed across LinkedIn and Meta",
  "The dominant theme is AI note-taking for teams and product ops",
  "Most CTAs emphasize templates, workflows, and async collaboration",
];

const characterVariants = {
  hidden: { opacity: 0, y: 4 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: 0.35 + index * 0.012,
      duration: 0.18,
      ease: "easeOut" as const,
    },
  }),
};

export function AiNativeAdIntelligence() {
  return (
    <section id="ai-native-ad-intelligence" className="py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-center gap-12 md:gap-16">
          <div className="text-center">
            <motion.div
              className="flex justify-center"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-4 py-1.5 text-sm font-medium text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span>MCP Server</span>
              </span>
            </motion.div>
            <motion.h2
              className="mt-6 text-4xl text-white md:text-5xl"
              style={{ lineHeight: 1.08 }}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.08 }}
            >
              AI-native ad intelligence
            </motion.h2>
            <motion.p
              className="mt-6 max-w-xl text-zinc-400"
              style={{ fontSize: 18, lineHeight: 1.9 }}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.14 }}
            >
              Adluv plugs into your AI workflow via Model Context Protocol (MCP) so research happens where the thinking does.
            </motion.p>
          </div>

          <motion.div
            className="w-full max-w-[40rem] overflow-hidden rounded-2xl border border-white/8 bg-zinc-950"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex h-[65px] items-center gap-4 border-b border-white/10 px-4 sm:px-5">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-red-500/70" />
                <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
                <span className="h-3 w-3 rounded-full bg-emerald-500/70" />
              </div>
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <span className="font-medium text-zinc-200">Claude</span>
                <span className="text-zinc-600">•</span>
                <span className="text-zinc-500">Adluv MCP</span>
              </div>
            </div>

            <div className="space-y-4 p-4">
              <div className="flex justify-end">
                <div className="max-w-[82%] rounded-[1.5rem] bg-violet-500 px-4 py-3 text-sm leading-6 text-white">
                  {prompt.split("").map((character, index) => (
                    <motion.span
                      key={`${character}-${index}`}
                      className="whitespace-pre-wrap"
                      custom={index}
                      variants={characterVariants}
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true }}
                    >
                      {character}
                    </motion.span>
                  ))}
                </div>
              </div>

              <motion.div
                className="grid overflow-hidden"
                initial={{ gridTemplateRows: "0fr", opacity: 0 }}
                whileInView={{ gridTemplateRows: ["0fr", "1fr", "1fr", "0fr"], opacity: [0, 1, 1, 0] }}
                viewport={{ once: true }}
                transition={{ delay: 1.4, duration: 0.7, times: [0, 0.18, 0.68, 1], ease: "easeOut" }}
              >
                <div className="min-h-0">
                  <div className="flex">
                    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900/80 px-4 py-2.5">
                      {[0, 1, 2].map((dot) => (
                        <motion.span
                          key={dot}
                          className="h-2.5 w-2.5 rounded-full bg-violet-400/80"
                          animate={{ opacity: [0.35, 1, 0.35], y: [0, -2, 0] }}
                          transition={{ duration: 1.1, repeat: Infinity, delay: dot * 0.14, ease: "easeInOut" }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>

              <motion.div
                className="rounded-2xl border border-white/10 bg-zinc-900/80 p-4"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 1.72, duration: 0.3 }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <rect x="7" y="7" width="10" height="10" rx="2" />
                      <path d="M12 4v2M12 18v2M4 12h2M18 12h2" />
                    </svg>
                  </div>

                  <div className="min-w-0 flex-1">
                    <motion.p
                      className="text-sm leading-6 text-zinc-200"
                      initial={{ opacity: 0, y: 8 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 1.28, duration: 0.25 }}
                    >
                      Notion is running 12 active creatives across LinkedIn and Meta this month.
                    </motion.p>

                    <div className="mt-3 space-y-2.5">
                      {responsePoints.slice(1).map((line, index) => (
                        <motion.div
                          key={line}
                          className="flex items-start gap-3"
                          initial={{ opacity: 0, y: 8 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: 1.36 + index * 0.1, duration: 0.25 }}
                        >
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
                          <p className="text-sm leading-6 text-zinc-300">{line}</p>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
