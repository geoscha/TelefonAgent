import { cn } from "@/lib/utils";

interface CuraMarkProps {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  showMark?: boolean;
}

/** Minimal care-loop mark + Hedvig serif wordmark */
export function CuraMark({
  className,
  markClassName,
  wordmarkClassName,
  showMark = true,
}: CuraMarkProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {showMark && (
        <svg
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden
          className={cn("h-8 w-8 shrink-0", markClassName)}
        >
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
      )}
      <span
        className={cn(
          "font-sans font-semibold text-[32px] leading-none tracking-tight",
          wordmarkClassName
        )}
      >
        Cura
      </span>
    </div>
  );
}

interface CuraWordmarkProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: "text-[22px]",
  md: "text-[26px]",
  lg: "text-[40px]",
};

export function CuraWordmark({ className, size = "md" }: CuraWordmarkProps) {
  return (
    <span
      className={cn(
        "font-sans font-semibold leading-none tracking-tight text-navy",
        sizeMap[size],
        className
      )}
    >
      Cura
    </span>
  );
}
