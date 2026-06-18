interface WelcomeBannerProps {
  name: string;
  highlight: string | number;
  highlightSuffix?: string;
}

export function WelcomeBanner({
  name,
  highlight,
  highlightSuffix,
}: WelcomeBannerProps) {
  return (
    <section className="relative h-[160px] overflow-hidden rounded-card">
      <div aria-hidden className="landing-gradient absolute inset-0" />
      <div className="relative z-10 flex h-full items-center justify-between gap-6 px-8 lg:px-10">
        <p className="font-sans text-[28px] font-medium leading-tight text-white lg:text-[34px]">
          Guten Tag, {name}
        </p>
        <div className="shrink-0 text-right">
          <p className="font-sans text-[48px] font-medium leading-none text-white lg:text-[56px]">
            {highlight}
          </p>
          {highlightSuffix && (
            <p className="mt-1 text-[13px] font-medium text-white/75">
              {highlightSuffix}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
