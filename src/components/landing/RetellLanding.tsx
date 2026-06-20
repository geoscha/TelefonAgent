import { IntegrationMarqueeBanner } from "@/components/landing/IntegrationMarqueeBanner";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingSiteFooter } from "@/components/landing/LandingSiteFooter";
import { LiveDemoSection } from "@/components/landing/LiveDemoSection";
import { RetellHero } from "@/components/landing/RetellHero";
import { RetellNav } from "@/components/landing/RetellNav";
import { WasIstLinker } from "@/components/landing/WasIstLinker";

/** Shared horizontal inset — matches white page padding around the gradient. */
const LANDING_INSET = "px-2.5 sm:px-3";

export function RetellLanding() {
  return (
    <div className={`retell-landing min-h-screen bg-white ${LANDING_INSET} pb-2.5 sm:pb-3`}>
      <RetellNav />
      <main>
        <RetellHero />
        <IntegrationMarqueeBanner />
        <WasIstLinker />
        <LiveDemoSection />
        <LandingFooter />
        <LandingSiteFooter />
      </main>
    </div>
  );
}
