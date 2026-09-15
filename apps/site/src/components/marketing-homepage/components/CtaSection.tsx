"use client";

import { motion } from "motion/react";

import { WaitlistSignupForm } from "./WaitlistSignupForm";

export function CtaSection({ isAuthenticated: _isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <section className="px-4 py-18 sm:px-6 sm:py-24">
      <div className="mx-auto w-[min(1100px,100%)]">
        <motion.div
          className="rounded-[2.25rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] px-8 py-14 text-center backdrop-blur sm:px-14 sm:py-18"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-400">Ready to stop guessing?</p>
          <h2 className="mx-auto mt-4 max-w-3xl text-balance text-4xl leading-[1.15] text-white md:text-5xl">
            Unlock your unfair advantage in ads
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base md:text-lg leading-8 text-zinc-400">
            Get free early access before we launch.
          </p>

          <WaitlistSignupForm
            className="mx-auto mt-8 max-w-xl"
            formClassName="flex flex-col gap-3 sm:flex-row"
            inputClassName="flex-1 rounded-xl border border-white/10 bg-white/5 px-5 py-3.5 text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500/40 focus:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-70"
            buttonClassName="group inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-7 py-3.5 text-[15px] font-semibold text-white transition-all hover:bg-violet-500 hover:shadow-lg hover:shadow-violet-600/25 disabled:cursor-not-allowed disabled:hover:bg-violet-600 disabled:hover:shadow-none"
            successClassName="mx-auto mt-8 flex max-w-3xl flex-col items-center justify-center text-center"
          />
        </motion.div>
      </div>
    </section>
  );
}
