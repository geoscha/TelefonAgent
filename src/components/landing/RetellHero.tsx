"use client";

import { G2RatingBadge } from "@/components/landing/G2RatingBadge";
import { LIVE_DEMO_SECTION_ID } from "@/components/landing/landing-layout";

function scrollToLiveDemo() {
  document.getElementById(LIVE_DEMO_SECTION_ID)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

export function RetellHero() {
  return (
    <section className="relative pb-2.5 sm:pb-3">
      <div className="landing-gradient landing-radius relative min-h-[calc(100vh-56px)] overflow-hidden sm:min-h-[calc(100vh-64px)]">
        <div className="flex min-h-[calc(100vh-56px)] flex-col justify-between px-5 pb-10 pt-14 sm:min-h-[calc(100vh-64px)] sm:px-10 sm:pb-12 sm:pt-16 lg:px-14">
          <div className="mx-auto flex w-full max-w-[min(560px,32vw)] flex-col items-center text-center">
            <p className="landing-hero-eyebrow mb-[60px] text-white">
              #1 KI-Telefonagent-Plattform für automatisierte Anrufe
            </p>
            <h1 className="font-retell-display w-full text-[clamp(54px,6.25vw,120px)] font-normal leading-[0.88] tracking-[-0.02em] text-white">
              <span className="block">Ihrem KI-</span>
              <span className="block">Callcenter</span>
              <span className="block">der</span>
              <span className="block">Zukunft.</span>
            </h1>
          </div>

          <div className="flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-end">
            <div className="flex max-w-[340px] flex-col gap-3">
              <G2RatingBadge />
              <p className="landing-hero-body text-white/90">
                Erstellen, einsetzen und verwalten Sie KI-Telefonagenten der
                nächsten Generation — natürlich klingend, aufgabenorientiert
                und mühelos skalierbar.
              </p>
            </div>

            <button
              type="button"
              onClick={scrollToLiveDemo}
              className="group landing-radius-sm inline-flex items-center gap-3 border border-white/20 bg-white/10 px-4 py-3 backdrop-blur-[20px] transition-colors hover:bg-white/15"
            >
              <span className="landing-hero-body font-normal text-white">
                Live-Demo ausprobieren
              </span>
              <span className="landing-radius-sm relative h-11 w-11 overflow-hidden bg-white/10">
                <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,#22d3bb_0%,#2563eb_45%,#6366f1_70%,transparent_100%)] opacity-90 blur-[1px]" />
                <span className="absolute inset-[18%] rounded-full bg-[radial-gradient(circle,#fff_0%,#22d3bb_45%,#3b82f6_100%)] shadow-[0_0_18px_rgba(34,211,187,0.55)]" />
              </span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
