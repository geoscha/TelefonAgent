import { LiveDemoSection } from "@/components/landing/LiveDemoSection";
import { RetellHero } from "@/components/landing/RetellHero";
import { RetellNav } from "@/components/landing/RetellNav";
import { WasIstCura } from "@/components/landing/WasIstCura";

/** Shared horizontal inset — matches white page padding around the gradient. */
const LANDING_INSET = "px-2.5 sm:px-3";

export function RetellLanding() {
  return (
    <div className={`retell-landing min-h-screen bg-white ${LANDING_INSET} pb-2.5 sm:pb-3`}>
      <div className="mx-auto w-full max-w-[1440px]">
        <RetellNav />
        <main>
          <RetellHero />
          <WasIstCura />
          <LiveDemoSection />
        </main>
      </div>
    </div>
  );
}
