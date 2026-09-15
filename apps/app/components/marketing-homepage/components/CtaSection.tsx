"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";

export function CtaSection({ isAuthenticated: _isAuthenticated }: { isAuthenticated: boolean }) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

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
          <p className="text-[13px] font-semibold uppercase tracking-[0.2em] text-violet-300">Ready to stop guessing?</p>
          <h2 className="mx-auto mt-4 max-w-3xl text-balance text-4xl text-white md:text-5xl" style={{ lineHeight: 1.15 }}>
            Unlock your unfair advantage in ads
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-zinc-400">
            Get early access and lock in 50% off at launch.
          </p>

          {!submitted ? (
            <form
              className="mx-auto mt-8 flex max-w-xl flex-col gap-3 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                if (email.trim()) setSubmitted(true);
              }}
            >
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter your email address"
                required
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-5 py-3.5 text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500/40 focus:bg-white/[0.07]"
                style={{ fontSize: 14 }}
              />
              <button
                type="submit"
                className="group inline-flex items-center justify-center rounded-xl bg-violet-600 px-7 py-3.5 text-[15px] font-semibold text-white transition-all hover:bg-violet-500 hover:shadow-lg hover:shadow-violet-600/25"
              >
                Join Waitlist
                <ArrowRight size={16} className="ml-2 transition-transform group-hover:translate-x-0.5" />
              </button>
            </form>
          ) : (
            <div className="mx-auto mt-8 max-w-md rounded-xl border border-violet-500/20 bg-violet-500/10 px-6 py-4">
              <p className="text-[15px] font-medium text-violet-200">You&apos;re on the list. We&apos;ll be in touch soon.</p>
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
