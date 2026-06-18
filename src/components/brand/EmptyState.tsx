import { BrandGradient } from "@/components/brand/BrandGradient";
import type { GradientVariant } from "@/lib/avatar-gradient";
import { cn } from "@/lib/utils";

type EmptyIllustration = "phone" | "integrations" | "calls";

interface EmptyStateProps {
  illustration: EmptyIllustration;
  title: string;
  description?: string;
  gradient?: GradientVariant;
  subtle?: boolean;
  className?: string;
}

function PhoneIllustration() {
  return (
    <svg viewBox="0 0 80 80" fill="none" className="h-20 w-20" aria-hidden>
      <rect x="24" y="12" width="32" height="56" rx="6" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="40" cy="60" r="2" fill="currentColor" />
      <path d="M34 20h12M34 26h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SoundwaveIllustration() {
  return (
    <svg viewBox="0 0 80 80" fill="none" className="h-20 w-20" aria-hidden>
      {[20, 28, 36, 44, 52, 60, 68].map((x, i) => {
        const heights = [12, 20, 28, 16, 24, 18, 10];
        const h = heights[i];
        return (
          <line
            key={x}
            x1={x}
            y1={40 - h / 2}
            x2={x}
            y2={40 + h / 2}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity={0.7}
          />
        );
      })}
    </svg>
  );
}

function IntegrationsIllustration() {
  return (
    <svg viewBox="0 0 80 80" fill="none" className="h-20 w-20" aria-hidden>
      <rect x="14" y="24" width="20" height="20" rx="4" stroke="currentColor" strokeWidth="1.5" />
      <rect x="46" y="24" width="20" height="20" rx="4" stroke="currentColor" strokeWidth="1.5" />
      <rect x="30" y="48" width="20" height="20" rx="4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

const illustrations: Record<EmptyIllustration, () => JSX.Element> = {
  phone: PhoneIllustration,
  calls: SoundwaveIllustration,
  integrations: IntegrationsIllustration,
};

export function EmptyState({
  illustration,
  title,
  description,
  subtle = false,
  className,
}: EmptyStateProps) {
  const Illustration = illustrations[illustration];

  return (
    <div
      className={cn(
        "relative flex flex-col items-center px-6 py-12 text-center",
        className
      )}
    >
      {subtle ? (
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded border border-[#E1E4EA] bg-[#F5F7FA] text-[#99A0AE]">
          <Illustration />
        </div>
      ) : (
        <div className="relative mb-8 flex h-36 w-36 items-center justify-center">
          <div className="absolute inset-0 overflow-hidden rounded-full">
            <BrandGradient variant="cool" blur="medium" />
          </div>
          <div className="relative z-10 text-text-muted">
            <Illustration />
          </div>
        </div>
      )}
      <h3 className="text-[15px] font-normal text-[#0E121B]">{title}</h3>
      {description && (
        <p className="mt-1 text-[13px] text-[#525866]">{description}</p>
      )}
    </div>
  );
}
