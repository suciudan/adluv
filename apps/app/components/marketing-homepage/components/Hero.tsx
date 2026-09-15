"use client";

import { type ReactNode, type FormEvent, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";

import { GoogleAdsLogo } from "../../source-logo";
import { BlackHoleDots, type BlackHoleDotsHandle } from "./BlackHoleDots";

const platforms = ["Meta", "Google", "LinkedIn", "TikTok", "Reddit", "X"];

const brandLogos: Record<string, { svg: ReactNode; soon?: boolean }> = {
  Meta: {
    svg: (
      <svg viewBox="0 0 36 36" fill="#0081FB" className="h-5 w-5">
        <path d="M8.143 0C3.886 0 .93 3.78.93 8.759c0 4.906 2.865 8.759 7.214 8.759 2.252 0 3.994-1.1 5.236-2.855l.057-.093.06.093c1.326 1.903 3.048 2.855 5.17 2.855 4.406 0 7.393-3.893 7.393-8.76C26.06 3.742 23.056 0 18.667 0c-2.14 0-3.88.975-5.23 2.855l-.06.093-.056-.093C12.119.97 10.378 0 8.143 0zm.16 3.39c1.215 0 2.27.724 3.228 2.217l1.033 1.609.322.502.322-.502 1.033-1.609c.958-1.493 2.013-2.217 3.228-2.217 2.583 0 4.176 2.487 4.176 5.37 0 2.921-1.632 5.368-4.176 5.368-1.215 0-2.27-.724-3.228-2.217l-1.033-1.609-.322-.502-.322.502-1.033 1.609c-.958 1.493-2.013 2.217-3.228 2.217-2.583 0-4.176-2.487-4.176-5.369 0-2.921 1.632-5.369 4.176-5.369z" />
      </svg>
    ),
  },
  Google: {
    svg: <GoogleAdsLogo className="h-5 w-5" />,
  },
  LinkedIn: {
    svg: (
      <svg viewBox="0 0 24 24" fill="#0A66C2" className="h-5 w-5">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
  TikTok: {
    soon: true,
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
      </svg>
    ),
  },
  Reddit: {
    soon: true,
    svg: (
      <svg viewBox="0 0 24 24" fill="#FF4500" className="h-5 w-5">
        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
      </svg>
    ),
  },
  X: {
    soon: true,
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
};

export function Hero({ isAuthenticated: _isAuthenticated }: { isAuthenticated: boolean }) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const dotsRef = useRef<BlackHoleDotsHandle>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (email.trim()) setSubmitted(true);
  };

  return (
    <section
      className="relative flex min-h-screen items-center overflow-hidden pt-16"
      onMouseMove={(event) => dotsRef.current?.onMouseMove(event.clientX, event.clientY)}
      onMouseLeave={() => dotsRef.current?.onMouseLeave()}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/8 blur-[180px]" />
      </div>

      <BlackHoleDots ref={dotsRef} />

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-2 lg:gap-16">
        <div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <span
              className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-1.5 text-violet-400"
              style={{ fontSize: 13, fontWeight: 500 }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
              Get early access. Save 50%.
            </span>
          </motion.div>

          <motion.h1
            className="mt-8 text-5xl text-white md:text-7xl"
            style={{ lineHeight: 1.1 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            Track ads across any brand, <em className="text-violet-400">instantly</em>
          </motion.h1>

          <motion.p
            className="mt-6 max-w-xl text-base text-zinc-400 md:text-lg"
            style={{ lineHeight: 1.7 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            Monitor, benchmark, and save ads from competitors and target accounts in one place, with landing pages,
            unlimited creatives, and performance insights.
          </motion.p>

          <motion.div
            className="mt-6 flex flex-wrap items-center gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.25 }}
          >
            <span className="text-zinc-500" style={{ fontSize: 13 }}>
              Works across:
            </span>
            {platforms.map((platform) => {
              const brand = brandLogos[platform];
              return (
                <span key={platform} className="relative text-zinc-400" title={platform}>
                  {brand?.svg}
                  {brand?.soon ? (
                    <span
                      className="absolute -right-2.5 -top-2.5 rounded-full bg-violet-500/15 px-1.5 py-px text-violet-400"
                      style={{ fontSize: 9, fontWeight: 600 }}
                    >
                      soon
                    </span>
                  ) : null}
                </span>
              );
            })}
          </motion.div>
        </div>

        <motion.div
          id="waitlist"
          className="w-full max-w-md rounded-2xl border border-white/8 bg-white/[0.02] p-8 backdrop-blur-xl sm:p-10 lg:ml-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <h2 className="text-2xl text-white md:text-3xl" style={{ lineHeight: 1.2 }}>
            Become a founding member
          </h2>
          <p className="mt-3 text-zinc-400" style={{ fontSize: 14, lineHeight: 1.7 }}>
            Get early access and lock in 50% off at launch.
          </p>

          {!submitted ? (
            <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter your email address"
                required
                className="w-full rounded-xl border border-white/10 bg-white/5 px-5 py-3.5 text-white outline-none transition-colors hover:border-white/20 hover:bg-white/[0.06] focus:border-violet-500/40 focus:bg-white/[0.07]"
                style={{ fontSize: 14 }}
              />
              <button
                type="submit"
                className="group flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-violet-600 px-7 py-3.5 text-white transition-all hover:bg-violet-500 hover:shadow-lg hover:shadow-violet-600/25"
                style={{ fontSize: 15, fontWeight: 600 }}
              >
                Join Waitlist
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
              </button>
            </form>
          ) : (
            <div className="mt-8 rounded-xl border border-violet-500/20 bg-violet-500/10 px-6 py-4">
              <p className="text-violet-300" style={{ fontSize: 15, fontWeight: 500 }}>
                You&apos;re on the list! We&apos;ll be in touch soon.
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
