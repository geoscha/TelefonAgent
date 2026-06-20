import Link from "next/link";

import { LANDING_CONTENT_CLASS, LIVE_DEMO_SECTION_ID } from "@/components/landing/landing-layout";
import { cn } from "@/lib/utils";

type FooterLink = { label: string; href: string };

type FooterColumn = { title: string; links: FooterLink[] };

const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: "Produkt & Support",
    links: [
      { label: "Dokumentation", href: "#" },
      { label: "Preise", href: "#" },
      { label: "Changelog", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Kundenstorys", href: "#" },
      { label: "Live-Demo", href: `#${LIVE_DEMO_SECTION_ID}` },
      { label: "Statusseite", href: "#" },
    ],
  },
  {
    title: "Produkte vergleichen",
    links: [
      { label: "Vergleichsübersicht", href: "#" },
      { label: "vs. IVR", href: "#" },
      { label: "vs. Telefonzentrale", href: "#" },
      { label: "vs. Mailbox", href: "#" },
      { label: "vs. Callcenter", href: "#" },
    ],
  },
  {
    title: "Partner",
    links: [
      { label: "Partnerprogramm", href: "#" },
      { label: "Partner-Verzeichnis", href: "#" },
      { label: "App-Partner", href: "#" },
    ],
  },
  {
    title: "Unternehmen",
    links: [
      { label: "Über uns", href: "#" },
      { label: "Karriere", href: "#" },
      { label: "Presse", href: "#" },
    ],
  },
  {
    title: "Soziale Medien",
    links: [
      { label: "LinkedIn", href: "#" },
      { label: "X", href: "#" },
      { label: "YouTube", href: "#" },
      { label: "Community", href: "#" },
    ],
  },
];

const LEGAL_LINKS: FooterLink[] = [
  { label: "Trust Center", href: "#" },
  { label: "Datenschutz", href: "#" },
  { label: "Nutzungsbedingungen", href: "#" },
  { label: "Cookie-Einstellungen", href: "#" },
];

const COMPLIANCE_BADGES = ["SOC 2", "DSGVO", "DSG"] as const;

function CareMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <path
        d="M16 6C11 6 7 10 7 15c0 4 2.5 7.5 6 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M16 6c5 0 9 4 9 9 0 4-2.5 7.5-6 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="16" cy="15" r="2" fill="currentColor" />
    </svg>
  );
}

function FooterLinkList({ links }: { links: FooterLink[] }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {links.map((link) => (
        <li key={link.label}>
          <Link
            href={link.href}
            className="landing-body text-[#525866] transition-colors hover:text-[#0E121B]"
          >
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function AiProviderIcons() {
  return (
    <div className="mt-3 flex items-center gap-3 text-[#99A0AE]" aria-hidden>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <path
          d="M12 3l1.4 4.3H18l-3.6 2.6 1.4 4.3L12 11.6 8.2 14.2l1.4-4.3L6 7.3h4.6L12 3z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
        <path d="M12 2a7 7 0 00-7 7c0 3.1 2 5.7 4.8 6.6-.1-.5-.2-1.3-.2-2.2 0-2.2 1.8-4 4-4s4 1.8 4 4c0 .9-.1 1.7-.2 2.2A7 7 0 0012 2z" />
      </svg>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <path
          d="M4 8h16M4 16h16M8 4v16M16 4v16"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function ComplianceBadge({ label }: { label: string }) {
  return (
    <div
      className={cn(
        "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
        "border border-[#E1E4EA] bg-white text-center"
      )}
    >
      <span className="landing-caption max-w-[44px] font-medium leading-tight text-[#525866]">
        {label}
      </span>
    </div>
  );
}

export function LandingSiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="pt-2.5 sm:pt-3">
      <div className={cn(LANDING_CONTENT_CLASS, "py-6 sm:py-8")}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
          <h2 className="shrink-0 font-retell-display text-[clamp(32px,4vw,48px)] font-normal leading-[0.95] tracking-[-0.02em] text-[#0E121B]">
            Ressourcen
          </h2>

          <div className="flex min-w-0 flex-1 flex-wrap justify-between gap-x-3 gap-y-5 sm:gap-x-4 lg:gap-x-2 xl:gap-x-4">
            {FOOTER_COLUMNS.map((column) => (
              <div key={column.title} className="min-w-[120px] flex-1 sm:max-w-[180px] lg:max-w-none">
                <p className="landing-caption font-medium text-[#335cff]">{column.title}</p>
                <FooterLinkList links={column.links} />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 border-t border-[#E1E4EA] pt-6 lg:mt-8 lg:pt-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
            <div className="min-w-0 lg:max-w-[55%]">
              <h3 className="font-retell-display text-[clamp(24px,3vw,36px)] font-normal leading-[1.05] tracking-[-0.02em] text-[#0E121B]">
                KI-Zusammenfassung anfordern
              </h3>
              <p className="landing-subtitle mt-2 text-[#525866]">
                Erfahren Sie mehr darüber, wie Linker das Kundenerlebnis bei
                führenden Unternehmen verbessert.
              </p>
              <AiProviderIcons />
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2.5 lg:justify-end">
              {COMPLIANCE_BADGES.map((badge) => (
                <ComplianceBadge key={badge} label={badge} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-[#E1E4EA] pt-4 sm:flex-row sm:items-center sm:justify-between lg:mt-7">
          <p className="landing-caption text-[#99A0AE]">© {year} Linker</p>
          <nav
            aria-label="Rechtliches"
            className="flex flex-wrap gap-x-5 gap-y-2 sm:justify-end"
          >
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="landing-caption text-[#525866] transition-colors hover:text-[#0E121B]"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <div className="landing-gradient landing-radius relative mt-2.5 overflow-hidden sm:mt-3">
        <div className="flex min-h-[180px] items-end px-5 pb-0 pt-10 sm:min-h-[220px] sm:px-8 sm:pt-14 lg:min-h-[260px] lg:px-14 lg:pt-16">
          <div className="flex translate-y-[12%] items-center gap-[0.12em] text-white">
            <CareMark className="h-[0.72em] w-[0.72em] shrink-0" />
            <span className="font-retell-display text-[clamp(80px,20vw,240px)] font-medium leading-[0.85] tracking-[-0.03em]">
              Linker
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
