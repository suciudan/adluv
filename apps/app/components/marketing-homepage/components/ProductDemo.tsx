import { motion } from "motion/react";
import { Bookmark, Columns3, Play, Search, SlidersHorizontal } from "lucide-react";

const callouts = [
  { icon: Search, text: "Search by brand, keyword, or campaign theme" },
  { icon: SlidersHorizontal, text: "Narrow results by format, country, and date" },
  { icon: Columns3, text: "Open ads fast and compare angles side by side" },
  { icon: Bookmark, text: "Save the best examples to collections for future campaigns" },
];

export function ProductDemo() {
  return (
    <section id="demo" className="relative py-20 md:py-28">
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <motion.span
            className="text-violet-400"
            style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const }}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            Product demo
          </motion.span>
          <motion.h2
            className="mt-4 text-4xl text-white md:text-5xl"
            style={{ lineHeight: 1.15 }}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            See every useful LinkedIn ad signal in one place
          </motion.h2>
          <motion.p
            className="mt-4 text-zinc-400"
            style={{ fontSize: 16, lineHeight: 1.7 }}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 }}
          >
            Search, filter, review, save, and share LinkedIn ad examples without bouncing between tabs.
          </motion.p>
        </div>

        <motion.div
          className="mx-auto mt-14 max-w-5xl overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center gap-2 border-b border-white/5 px-5 py-3">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
            </div>
            <div className="ml-4 flex-1 rounded-md bg-white/5 px-4 py-1.5">
              <span className="text-zinc-500" style={{ fontSize: 12 }}>
                app.adluv.io/explore
              </span>
            </div>
          </div>

          <div className="relative flex aspect-[16/9] items-center justify-center bg-[#0c0c14]">
            <div className="absolute inset-6 grid grid-cols-3 gap-3 opacity-30 max-sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
                  <div className="aspect-video rounded bg-white/5" />
                  <div className="mt-2 h-2 w-3/4 rounded bg-white/5" />
                  <div className="mt-1 h-2 w-1/2 rounded bg-white/5" />
                </div>
              ))}
            </div>

            <button className="group relative z-10 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-8 py-4 backdrop-blur-sm transition-all hover:border-violet-500/30 hover:bg-violet-600/10">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-600 transition-transform group-hover:scale-110">
                <Play size={20} className="ml-0.5 text-white" fill="white" />
              </div>
              <span className="text-white" style={{ fontSize: 15, fontWeight: 500 }}>
                Watch the 90-second demo
              </span>
            </button>
          </div>
        </motion.div>

        <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-2">
          {callouts.map((callout, i) => (
            <motion.div
              key={callout.text}
              className="flex items-start gap-3"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 + i * 0.06 }}
            >
              <callout.icon size={18} className="mt-0.5 shrink-0 text-violet-400" />
              <span className="text-zinc-300" style={{ fontSize: 15 }}>
                {callout.text}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
