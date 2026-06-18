"use client";

import Link from "next/link";

import { CuraLogo } from "@/components/brand/CuraLogo";
import {
  landingNavBtnPrimary,
  landingNavBtnSecondary,
} from "@/components/landing/landing-buttons";
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
          <Link href="/login" className={landingNavBtnSecondary}>
            Anmelden
          </Link>
          <button
            type="button"
            className={cn(
              landingNavBtnSecondary,
              "hidden sm:inline-flex"
            )}
          >
            Vertrieb kontaktieren
          </button>
          <Link href="/signup" className={landingNavBtnPrimary}>
            Kostenlos testen
          </Link>
        </div>
      </div>
    </header>
  );
}
