import Link from "next/link";
import { cn } from "@/lib/utils";

export type LinkerLogoMode = "difference" | "contextual";
export type LinkerLogoTheme = "light" | "dark";

interface LinkerLogoProps {
  /**
   * difference — white wordmark + mix-blend-mode:difference (auto-inverts).
   *   Default for nav; tints blue/cyan over multi-colour gradients — switch to
   *   contextual on gradient surfaces if that looks off.
   * contextual — explicit theme; always legible.
   *   theme="dark"  → --navy on light/off-white backgrounds
   *   theme="light" → white on gradient/dark backgrounds (login, banner)
   *
   * To use contextual nav instead of difference:
   *   <LinkerLogo mode="contextual" theme="dark" />
   */
  mode?: LinkerLogoMode;
  theme?: LinkerLogoTheme;
  size?: "sm" | "md" | "lg";
  showMark?: boolean;
  className?: string;
  href?: string;
}

const sizeMap = {
  sm: { word: "text-[24px]", mark: "h-6 w-6" },
  md: { word: "text-[28px]", mark: "h-7 w-7" },
  lg: { word: "text-[42px]", mark: "h-9 w-9" },
};

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

export function LinkerLogo({
  mode = "contextual",
  theme = "dark",
  size = "md",
  showMark = false,
  className,
  href,
}: LinkerLogoProps) {
  const sizes = sizeMap[size];

  const wordmark = (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 font-retell-display font-medium leading-none tracking-[-0.02em]",
        mode === "difference"
          ? "text-white mix-blend-difference"
          : theme === "dark"
          ? "text-navy"
          : "text-white",
        className
      )}
    >
      {showMark && (
        <CareMark className={cn("shrink-0", sizes.mark, "currentColor")} />
      )}
      <span className={sizes.word}>Linker</span>
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex shrink-0">
        {wordmark}
      </Link>
    );
  }

  return wordmark;
}
