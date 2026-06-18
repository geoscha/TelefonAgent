"use client";

import Link from "next/link";

import { CuraLogo } from "@/components/brand/CuraLogo";
import { LANDING_CONTENT_CLASS } from "@/components/landing/landing-layout";
import { cn } from "@/lib/utils";

export function RetellNav() {
  return (
    <header className="sticky top-2.5 z-50 mb-2.5 flex justify-center sm:top-3 sm:mb-3">
      <div
        className={cn(
          LANDING_CONTENT_CLASS,
          "landing-nav-glass landing-radius flex items-center justify-between gap-6",
          "px-4 py-2 sm:gap-8 sm:px-5 sm:py-2"
        )}
      >
        <CuraLogo mode="contextual" theme="dark" size="sm" href="/" />

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <Link
            href="/login"
            className="landing-caption landing-radius-sm inline-flex min-h-8 items-center bg-[#F5F5FA] px-2.5 text-navy transition-colors hover:bg-[#EBEBF2] sm:min-h-9 sm:px-3"
          >
            Anmelden
          </Link>
          <button
            type="button"
            className="landing-caption landing-radius-sm hidden min-h-9 items-center px-2.5 text-navy transition-colors hover:bg-black/[0.04] sm:inline-flex sm:px-3"
          >
            Vertrieb kontaktieren
          </button>
          <Link
            href="/signup"
            className="landing-caption landing-radius-sm inline-flex min-h-8 items-center bg-navy px-2.5 text-white transition-colors hover:bg-[#12233D] sm:min-h-9 sm:px-3"
          >
            Kostenlos testen
          </Link>
        </div>
      </div>
    </header>
  );
}
