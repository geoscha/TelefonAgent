/** Nav CTAs — fixed landing sizes (11px / 6px radius), same as RetellNav «Anmelden». */
const landingNavBtnBase =
  "inline-flex items-center font-[family-name:'Untitled_Sans',Georgia,sans-serif] text-[11px] font-normal leading-[1.35] tracking-[-0.02em]";

export const landingNavBtnSecondary =
  `${landingNavBtnBase} min-h-8 rounded-[6px] bg-[#F5F5FA] px-2.5 text-navy transition-colors hover:bg-[#EBEBF2] disabled:opacity-50 sm:min-h-9 sm:px-3`;

export const landingNavBtnPrimary =
  `${landingNavBtnBase} min-h-8 rounded-[6px] bg-navy px-2.5 text-white transition-colors hover:bg-[#12233D] disabled:opacity-50 sm:min-h-9 sm:px-3`;

/** In-app actions — slightly larger for content areas. */
export const landingBtnSecondary =
  "landing-caption landing-radius-sm inline-flex min-h-9 items-center gap-2 bg-[#F5F5FA] px-3 text-[#050f1f] transition-colors hover:bg-[#EBEBF2] disabled:opacity-50";

export const landingBtnPrimary =
  "landing-caption landing-radius-sm inline-flex min-h-9 items-center gap-2 bg-[#050f1f] px-3 text-white transition-colors hover:bg-[#12233D] disabled:opacity-50";

export const landingBtnGhost =
  "landing-caption landing-radius-sm inline-flex min-h-9 items-center gap-2 px-3 text-[#525866] transition-colors hover:bg-[#F5F7FA] hover:text-[#0E121B] disabled:opacity-50";

/** Equal-width connect / disconnect actions on integration provider cards. */
export const landingIntegrationCardBtn = "w-[6.5rem] justify-center";

export const landingPanelClass =
  "landing-panel border border-[#E1E4EA] bg-white";

export const landingInputClass =
  "landing-body landing-radius-sm w-full border border-[#E1E4EA] bg-white px-3 py-2 text-[#0E121B] focus:border-[#335cff] focus:outline-none focus:ring-2 focus:ring-[#335cff]/20";
