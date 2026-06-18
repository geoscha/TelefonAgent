"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { LANDING_DISPLAY_HEADLINE_CLASS } from "@/components/landing/landing-layout";
import { cn } from "@/lib/utils";

export function LandingFooter() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitted(true);
  }

  return (
    <section className="pt-2.5 sm:pt-3">
      <div className="landing-gradient landing-radius relative min-h-[420px] overflow-hidden sm:min-h-[500px] lg:min-h-[560px]">
        <div className="relative flex min-h-[420px] flex-col justify-between p-5 sm:min-h-[500px] sm:p-10 lg:min-h-[560px] lg:p-14">
          <h2 className={cn(LANDING_DISPLAY_HEADLINE_CLASS, "max-w-[12ch]")}>
            <span className="block">Gebaut für</span>
            <span className="block">Skalierung,</span>
          </h2>

          <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
            <div className="w-full max-w-[420px]">
              <p className="landing-hero-body mb-4 text-white/85">
                Abonnieren Sie unseren Newsletter für Produkt-Updates.
              </p>
              {submitted ? (
                <p className="landing-hero-body text-white" role="status">
                  Vielen Dank — wir halten Sie auf dem Laufenden.
                </p>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  className="flex items-center gap-2 border border-white/15 bg-white/10 p-1.5 backdrop-blur-[20px] landing-radius-sm"
                >
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Ihre E-Mail"
                    required
                    autoComplete="email"
                    className="landing-hero-body min-w-0 flex-1 bg-transparent px-3 py-2.5 text-white placeholder:text-white/45 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="landing-radius-sm inline-flex shrink-0 items-center gap-1.5 bg-white px-4 py-2.5 text-[#0E121B] transition-opacity hover:opacity-90"
                  >
                    <span className="landing-caption font-medium text-[#0E121B]">
                      Absenden
                    </span>
                    <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </form>
              )}
            </div>

            <h2
              className={cn(
                LANDING_DISPLAY_HEADLINE_CLASS,
                "max-w-[12ch] self-end text-right"
              )}
            >
              <span className="block">menschlich</span>
              <span className="block">konzipiert.</span>
            </h2>
          </div>
        </div>
      </div>
    </section>
  );
}
