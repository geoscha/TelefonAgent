import { Check, X } from "lucide-react";

import { LANDING_CONTENT_CLASS } from "@/components/landing/landing-layout";

const OTHER_LIMITATIONS = [
  "Unnatürliche Gespräche (begrenzte Interaktion)",
  "Langsame Einrichtung mit komplexer Konfiguration",
  "Kein Umgang mit Edge-Cases oder unerwarteten Eingaben",
  "Nur einfache Ein-Schritt-Anrufe und Inbound",
] as const;

const CURA_BENEFITS = [
  "Natürliche, menschlich klingende Gespräche",
  "Schnelle Einrichtung mit minimalem Setup",
  "Umgang mit Edge-Cases und unerwarteten Anfragen",
  "Komplexe Mehr-Schritt-Gespräche und Terminbuchung",
] as const;

export function WasIstCura() {
  return (
    <section className="pt-2.5 sm:pt-3">
      <div className={LANDING_CONTENT_CLASS}>
        <div className="pb-2 pt-6 sm:pt-8">
          <p className="landing-eyebrow">Überblick</p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
            <h2 className="landing-title">Was ist Cura?</h2>
            <p className="landing-subtitle max-w-[320px] lg:text-right">
              KI-gestützte, menschlich klingende Telefonagenten — speziell für
              Schweizer Liegenschaftsverwaltungen.
            </p>
          </div>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-3">
          <article className="landing-card flex min-h-[300px] flex-col p-6 sm:min-h-[320px] sm:p-8">
            <p className="landing-card-label text-[#0E121B]">Andere Lösung</p>
            <h3 className="landing-card-title mt-5 text-[#0E121B]">
              Klassisches IVR
            </h3>
            <p className="landing-body mt-auto pt-8 text-[#0E121B]">
              Primär für Anrufweiterleitung über feste Menüoptionen und
              Tasteneingaben.
            </p>
          </article>

          <article className="landing-card flex min-h-[300px] flex-col p-6 sm:min-h-[320px] sm:p-8">
            <p className="landing-card-label text-[#0E121B]">Andere Lösung</p>
            <h3 className="landing-card-title mt-5 text-[#0E121B]">
              Basis-Sprachbot
            </h3>
            <p className="landing-card-lead mt-2">Angetrieben durch NLP und Intent-Erkennung</p>
            <ul className="mt-4 space-y-2.5">
              {OTHER_LIMITATIONS.map((item) => (
                <li key={item} className="landing-body flex gap-2 text-[#0E121B]">
                  <X className="mt-0.5 h-3 w-3 shrink-0 stroke-[1.75]" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="landing-card-dark flex min-h-[300px] flex-col p-6 sm:col-span-2 sm:min-h-[320px] sm:p-8 lg:col-span-1">
            <p className="landing-card-label text-white">Unsere Lösung</p>
            <h3 className="landing-card-title mt-5 text-white">
              Cura KI-Telefonagent
            </h3>
            <p className="landing-body mt-2 text-white/65">
              Angetrieben durch LLMs
            </p>
            <ul className="mt-4 space-y-2.5">
              {CURA_BENEFITS.map((item) => (
                <li key={item} className="landing-body flex gap-2 text-white">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 stroke-[1.75]" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}
