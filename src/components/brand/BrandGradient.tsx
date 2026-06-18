import { cn } from "@/lib/utils";
import type { GradientVariant } from "@/lib/avatar-gradient";

interface BrandGradientProps {
  variant: GradientVariant;
  className?: string;
  blur?: "none" | "soft" | "medium";
}

const blurMap = {
  none: "",
  soft: "blur-[40px] scale-110",
  medium: "blur-[60px] scale-125",
};

export function BrandGradient({
  variant,
  className,
  blur = "soft",
}: BrandGradientProps) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <div
        className={cn(
          "absolute inset-0",
          variant === "warm" ? "brand-gradient-warm" : "brand-gradient-cool",
          blurMap[blur]
        )}
      />
    </div>
  );
}
