"use client";

import { type ReactNode, useRef } from "react"
import { motion } from "motion/react"

import { BlackHoleDots, type BlackHoleDotsHandle } from "./BlackHoleDots"
import { WaitlistSignupForm } from "./WaitlistSignupForm"
import GoogleAdsLogo from "../../Brands/GoogleAdsLogo"
import RedditLogo from "../../Brands/RedditLogo"
import MetaLogo from "../../Brands/MetaLogo"

const platforms = ["Meta", "Google", "LinkedIn", "Claude", "ChatGPT", "Gemini"]

const brandLogos: Record<string, { svg: ReactNode; soon?: boolean }> = {
  Meta: {
    svg: <MetaLogo className="size-5" />,
  },
  Google: {
    svg: <GoogleAdsLogo className="size-5" />,
  },
  LinkedIn: {
    svg: (
      <svg viewBox="0 0 24 24" fill="#0A66C2" className="size-5">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
  Claude: {
    svg: (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            style={{ flex: "none", lineHeight: "1" }}
            viewBox="0 0 24 24"
            className="size-5"
        >
          <path
              fill="#D97757"
              d="m4.709 15.955 4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a3 3 0 0 1-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312z"
          />
        </svg>
    ),
  },
  ChatGPT: {
    svg: (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="currentColor"
            fillRule="evenodd"
            style={{ flex: "none", lineHeight: "1" }}
            viewBox="0 0 24 24"
            className="size-5 fill-white"
        >
          <path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.8.8 0 0 0-.856 0zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.43.43 0 0 1 .476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142a.45.45 0 0 1-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.48 4.48 0 0 1 4.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.43.43 0 0 1-.476 0m-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71a.79.79 0 0 0 .856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523m5.899 2.83a5.95 5.95 0 0 0 5.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947a5.7 5.7 0 0 0-1.88.31A5.96 5.96 0 0 0 10.205 0a5.95 5.95 0 0 0-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 0 0 4.162 1.713z"></path>
        </svg>
    )
  },
  Gemini: {
    svg: (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            style={{ flex: "none", lineHeight: "1" }}
            viewBox="0 0 24 24"
            className="size-5"
        >
          <path
              fill="#3186FF"
              d="M20.616 10.835a14.2 14.2 0 0 1-4.45-3.001 14.1 14.1 0 0 1-3.678-6.452.503.503 0 0 0-.975 0 14.13 14.13 0 0 1-3.679 6.452 14.2 14.2 0 0 1-4.45 3.001q-.976.42-2.002.678a.502.502 0 0 0 0 .975q1.025.258 2.002.677a14.2 14.2 0 0 1 4.45 3.001 14.1 14.1 0 0 1 3.679 6.453.502.502 0 0 0 .975 0q.258-1.026.677-2.003a14.15 14.15 0 0 1 3.001-4.45 14.1 14.1 0 0 1 6.453-3.678.503.503 0 0 0 0-.975 13 13 0 0 1-2.003-.678"
          ></path>
          <path
              fill="url(#lobe-icons-gemini-0-_R_0_)"
              d="M20.616 10.835a14.2 14.2 0 0 1-4.45-3.001 14.1 14.1 0 0 1-3.678-6.452.503.503 0 0 0-.975 0 14.13 14.13 0 0 1-3.679 6.452 14.2 14.2 0 0 1-4.45 3.001q-.976.42-2.002.678a.502.502 0 0 0 0 .975q1.025.258 2.002.677a14.2 14.2 0 0 1 4.45 3.001 14.1 14.1 0 0 1 3.679 6.453.502.502 0 0 0 .975 0q.258-1.026.677-2.003a14.15 14.15 0 0 1 3.001-4.45 14.1 14.1 0 0 1 6.453-3.678.503.503 0 0 0 0-.975 13 13 0 0 1-2.003-.678"
          ></path>
          <path
              fill="url(#lobe-icons-gemini-1-_R_0_)"
              d="M20.616 10.835a14.2 14.2 0 0 1-4.45-3.001 14.1 14.1 0 0 1-3.678-6.452.503.503 0 0 0-.975 0 14.13 14.13 0 0 1-3.679 6.452 14.2 14.2 0 0 1-4.45 3.001q-.976.42-2.002.678a.502.502 0 0 0 0 .975q1.025.258 2.002.677a14.2 14.2 0 0 1 4.45 3.001 14.1 14.1 0 0 1 3.679 6.453.502.502 0 0 0 .975 0q.258-1.026.677-2.003a14.15 14.15 0 0 1 3.001-4.45 14.1 14.1 0 0 1 6.453-3.678.503.503 0 0 0 0-.975 13 13 0 0 1-2.003-.678"
          ></path>
          <path
              fill="url(#lobe-icons-gemini-2-_R_0_)"
              d="M20.616 10.835a14.2 14.2 0 0 1-4.45-3.001 14.1 14.1 0 0 1-3.678-6.452.503.503 0 0 0-.975 0 14.13 14.13 0 0 1-3.679 6.452 14.2 14.2 0 0 1-4.45 3.001q-.976.42-2.002.678a.502.502 0 0 0 0 .975q1.025.258 2.002.677a14.2 14.2 0 0 1 4.45 3.001 14.1 14.1 0 0 1 3.679 6.453.502.502 0 0 0 .975 0q.258-1.026.677-2.003a14.15 14.15 0 0 1 3.001-4.45 14.1 14.1 0 0 1 6.453-3.678.503.503 0 0 0 0-.975 13 13 0 0 1-2.003-.678"
          ></path>
          <defs>
            <linearGradient
                id="lobe-icons-gemini-0-_R_0_"
                x1="7"
                x2="11"
                y1="15.5"
                y2="12"
                gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#08B962"></stop>
              <stop offset="1" stopColor="#08B962" stopOpacity="0"></stop>
            </linearGradient>
            <linearGradient
                id="lobe-icons-gemini-1-_R_0_"
                x1="8"
                x2="11.5"
                y1="5.5"
                y2="11"
                gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#F94543"></stop>
              <stop offset="1" stopColor="#F94543" stopOpacity="0"></stop>
            </linearGradient>
            <linearGradient
                id="lobe-icons-gemini-2-_R_0_"
                x1="3.5"
                x2="17.5"
                y1="13.5"
                y2="12"
                gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#FABC12"></stop>
              <stop offset="0.46" stopColor="#FABC12" stopOpacity="0"></stop>
            </linearGradient>
          </defs>
        </svg>
    ),
  },
};

export function Hero({ isAuthenticated: _isAuthenticated }: { isAuthenticated: boolean }) {
  const dotsRef = useRef<BlackHoleDotsHandle>(null);

  return (
    <section
      className="relative flex bg-[#09090f] min-h-screen items-center overflow-hidden pt-24 pb-12 lg:pt-12 lg:pb-0"
      onMouseMove={(event) => dotsRef.current?.onMouseMove(event.clientX, event.clientY)}
      onMouseLeave={() => dotsRef.current?.onMouseLeave()}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-950/8 blur-[180px]" />
      </div>

      <BlackHoleDots ref={dotsRef} />

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-2 lg:gap-16">
        <div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <span
              className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-1.5 text-sm font-medium text-violet-400"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
              Get early access.
            </span>
          </motion.div>

          <motion.h1
            className="mt-8 text-5xl leading-[1.1] text-white md:text-7xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            Track ads across any brand, <em className="text-violet-400">instantly</em>
          </motion.h1>

          <motion.p
            className="mt-6 max-w-xl text-base leading-[1.7] text-zinc-400 md:text-lg"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            Automatically monitor, benchmark, and save competitor ads, with landing pages, creatives, and performance
            insights - in AdLuv and any AI workflow.
          </motion.p>

          <motion.div
            className="mt-6 flex flex-wrap items-center gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.25 }}
          >
            <span className="text-sm text-zinc-400">
              Works with:
            </span>
            {platforms.map((platform) => {
              const brand = brandLogos[platform];
              return (
                <span key={platform} className="relative text-zinc-400" title={platform}>
                  {brand?.svg}
                  {brand?.soon ? (
                    <span
                      className="absolute text-[8px] -right-4 -top-3 rounded-full bg-violet-500/15 px-1.5 py-px text-violet-400"
                    >
                      soon
                    </span>
                  ) : null}
                </span>
              );
            })}
            <span className="text-sm text-zinc-400">+ more</span>
          </motion.div>
        </div>

        <motion.div
          id="waitlist"
          className="w-full max-w-md rounded-2xl border border-white/8 bg-white/[0.02] p-8 backdrop-blur-xl sm:p-10 lg:ml-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <h2 className="text-2xl leading-[1.2] text-white md:text-3xl">
            Become a founding member
          </h2>
          <p className="mt-3 text-[14px] leading-[1.7] text-zinc-400">
            Get free early access before we launch.
          </p>

          <WaitlistSignupForm
            className="mt-8"
            formClassName="flex flex-col gap-3"
            inputClassName="w-full rounded-xl border border-white/10 bg-white/5 px-5 py-3.5 text-white outline-none transition-colors hover:border-white/20 hover:bg-white/[0.06] focus:border-violet-500/40 focus:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-70"
            buttonClassName="group flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-violet-600 px-7 py-3.5 text-[15px] font-semibold text-white transition-all hover:bg-violet-500 hover:shadow-lg hover:shadow-violet-600/25 disabled:cursor-not-allowed disabled:hover:bg-violet-600 disabled:hover:shadow-none"
            successClassName="mt-8 flex flex-col items-center justify-center text-center"
          />
        </motion.div>
      </div>
    </section>
  );
}
