interface WelcomeBannerProps {
  name: string;
  callsToday: number;
}

export function WelcomeBanner({ name, callsToday }: WelcomeBannerProps) {
  return (
    <section className="relative h-[200px] overflow-hidden rounded-card">
      {/* Animated replica of brand "Gradient 1" — two drifting layers */}
      <div aria-hidden className="welcome-gradient absolute inset-0" />
      <div aria-hidden className="welcome-gradient-overlay absolute inset-0" />
      {/* Dark scrim (left) for legible white text over the light blue-grey corner */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-navy/50 via-navy/15 to-transparent"
      />

      <div className="relative z-10 flex h-full items-center justify-between px-8 lg:px-10">
        <p className="font-sans text-[32px] font-normal leading-tight text-white drop-shadow-[0_1px_8px_rgba(20,36,46,0.4)] lg:text-[40px]">
          Guten Tag, {name}
        </p>
        <div className="hidden text-right sm:block">
          <p className="label-caps text-white/80 drop-shadow-[0_1px_4px_rgba(20,36,46,0.35)]">
            Anrufe heute
          </p>
          <p className="mt-1 font-sans text-[48px] font-normal leading-none text-white drop-shadow-[0_1px_8px_rgba(20,36,46,0.4)] lg:text-[56px]">
            {callsToday}
          </p>
        </div>
      </div>
    </section>
  );
}
