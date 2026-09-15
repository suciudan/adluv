import { readFile } from "node:fs/promises";
import path from "node:path";

import { Instrument_Serif, Inter } from "next/font/google";

import styles from "./marketing-homepage/styles.module.css";
import { Footer } from "./marketing-homepage/components/Footer";
import { Header } from "./marketing-homepage/components/Header";
import { renderLegalMdx } from "../lib/legal";
import { getCurrentUser } from "../lib/session";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
});

function extractTitle(source: string, fallbackTitle: string) {
  const match = source.match(/^#\s+(.*)$/m);

  if (!match) {
    return fallbackTitle;
  }

  return match[1].replace(/\*/g, "").trim() || fallbackTitle;
}

function stripLeadingTitle(source: string) {
  return source.replace(/^#\s+.*\n+/, "");
}

type LegalPageProps = {
  contentFileName: string;
  description: string;
  eyebrow: string;
  title?: string;
};

export async function LegalPage({
  contentFileName,
  description,
  eyebrow,
  title,
}: LegalPageProps) {
  const [user, source] = await Promise.all([
    getCurrentUser(),
    readFile(path.join(process.cwd(), "src", "content", contentFileName), "utf8"),
  ]);
  const content = await renderLegalMdx(stripLeadingTitle(source));
  const resolvedTitle = title ?? extractTitle(source, eyebrow);

  return (
    <div className={`${styles.root} ${inter.variable} ${instrumentSerif.variable} dark min-h-screen bg-[#09090f] text-white`}>
      <Header isAuthenticated={Boolean(user)} />

      <main className="mx-auto max-w-5xl px-6 pb-24 pt-32 sm:pt-36">
        <section className="border-b border-white/8 pb-12 text-center">
          <p className="text-sm font-semibold uppercase text-violet-400">{eyebrow}</p>
          <h1 className="mx-auto mt-6 max-w-4xl text-5xl text-white md:text-7xl">{resolvedTitle}</h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-zinc-400 md:text-lg">{description}</p>
        </section>

        <article className="prose prose-invert mx-auto mt-12 max-w-none prose-headings:font-normal prose-headings:text-white prose-h2:mt-12 prose-h2:mb-5 prose-h3:mt-8 prose-h3:mb-4 prose-p:my-4 prose-p:text-zinc-300 prose-ol:my-5 prose-ul:my-5 prose-li:my-2 prose-li:text-zinc-300 prose-strong:text-white prose-a:text-violet-300 prose-blockquote:border-violet-400/30 prose-blockquote:text-zinc-100">
          {content}
        </article>
      </main>

      <Footer isAuthenticated={Boolean(user)} />
    </div>
  );
}
