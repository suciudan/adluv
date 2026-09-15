"use client";

import styles from "./styles.module.css";
import { AiNativeAdIntelligence } from "./components/AiNativeAdIntelligence";
import { CtaSection } from "./components/CtaSection";
import { Features } from "./components/Features";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { UseCases } from "./components/UseCases";
import { WithVsWithout } from "./components/WithVsWithout";

export function MarketingHomepage({
  className,
  isAuthenticated,
}: {
  className: string;
  isAuthenticated: boolean;
}) {
  return (
    <div className={`${styles.root} ${className} dark min-h-screen bg-[#09090f] text-white`}>
      <Header isAuthenticated={isAuthenticated} />
      <main>
        <Hero isAuthenticated={isAuthenticated} />
        <Features />
        <AiNativeAdIntelligence />
        <WithVsWithout />
        <UseCases />
        <CtaSection isAuthenticated={isAuthenticated} />
      </main>
      <Footer isAuthenticated={isAuthenticated} />
    </div>
  );
}
