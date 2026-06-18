import { BrandGradient } from "@/components/brand/BrandGradient";
import type { GradientVariant } from "@/lib/avatar-gradient";
import { cn } from "@/lib/utils";

type EmptyIllustration = "phone" | "integrations" | "calls";

interface EmptyStateProps {
  illustration: EmptyIllustration;
  title: string;
  description: string;
  gradient?: GradientVariant;
  className?: string;
}

function PhoneIllustration() {
  return (
    <svg viewBox="0 0 80 80" fill="none" className="h-20 w-20" aria-hidden>
      <rect
        x="24"
        y="12"
        width="32"
        height="56"
        rx="6"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="40" cy="60" r="2" fill="currentColor" />
      <path
        d="M34 20h12M34 26h8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M52 28c4 2 6 6 6 10"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M56 24c6 3 10 9 10 16"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

function SoundwaveIllustration() {
  return (
    <svg viewBox="0 0 80 80" fill="none" className="h-20 w-20" aria-hidden>
      <path
        d="M16 40 L16 40"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
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
            stroke={i === 3 ? "var(--accent)" : "currentColor"}
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity={i === 3 ? 1 : 0.7}
          />
        );
      })}
    </svg>
  );
}

function IntegrationsIllustration() {
  return (
    <svg viewBox="0 0 80 80" fill="none" className="h-20 w-20" aria-hidden>
      <rect
        x="14"
        y="24"
        width="20"
        height="20"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="46"
        y="24"
        width="20"
        height="20"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="30"
        y="48"
        width="20"
        height="20"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M34 34h12M40 44v-4M40 44h6"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
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
  gradient = "cool",
  className,
}: EmptyStateProps) {
  const Illustration = illustrations[illustration];

  return (
    <div
      className={cn(
        "relative flex flex-col items-center px-6 py-16 text-center",
        className
      )}
    >
      <div className="relative mb-8 flex h-36 w-36 items-center justify-center">
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <BrandGradient variant={gradient} blur="medium" />
        </div>
        <div className="relative z-10 text-text-muted">
          <Illustration />
        </div>
      </div>
      <h3 className="font-sans font-semibold text-[22px] text-navy">{title}</h3>
      <p className="mt-2 max-w-sm text-body text-text-muted">{description}</p>
    </div>
  );
}
