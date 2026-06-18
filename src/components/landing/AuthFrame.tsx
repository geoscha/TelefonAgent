import Link from "next/link";
import { LandingFrame } from "@/components/landing/LandingFrame";
import { CuraLogo } from "@/components/brand/CuraLogo";
import { cn } from "@/lib/utils";

interface AuthFrameProps {
  children: React.ReactNode;
  title: string;
  footer?: React.ReactNode;
  className?: string;
}

export function AuthFrame({ children, title, footer, className }: AuthFrameProps) {
  return (
    <LandingFrame>
      <header className="relative z-20 flex items-center justify-between px-4 pt-4 sm:px-6 sm:pt-5">
        <CuraLogo mode="contextual" theme="light" size="sm" href="/" />
        <Link
          href="/"
          className="text-[13px] font-medium text-white/75 transition-colors hover:text-white sm:text-[14px]"
        >
          Zurück
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-8 sm:px-6">
        <div
          className={cn(
            "landing-glass w-full max-w-[400px] rounded-[22px] p-7 sm:p-8",
            className
          )}
        >
          <h1 className="font-sans text-[26px] font-semibold leading-tight text-white">
            {title}
          </h1>
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6">{footer}</div>}
        </div>
      </main>
    </LandingFrame>
  );
}

export function AuthField({
  label,
  children,
  action,
}: {
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-[13px] font-medium text-white/80">{label}</label>
        {action}
      </div>
      {children}
    </div>
  );
}

export const modalBackdropClass =
  "absolute inset-0 bg-black/10 backdrop-blur-md";

export const authInputClass =
  "flex h-10 w-full rounded-full border border-white/20 bg-white/10 px-4 text-[14px] text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:opacity-50";

export const authTextareaClass =
  "flex min-h-[72px] w-full resize-y rounded-[16px] border border-white/20 bg-white/10 px-4 py-3 text-[14px] leading-relaxed text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:opacity-50";

export const authLinkClass =
  "text-[13px] text-white/70 transition-colors hover:text-white";

export const authButtonClass =
  "inline-flex h-10 w-full items-center justify-center rounded-full bg-white text-[14px] font-medium text-navy transition-opacity hover:opacity-90 disabled:opacity-50";

export const authButtonOutlineClass =
  "inline-flex h-10 w-full items-center justify-center rounded-full border border-white/25 bg-transparent text-[14px] font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-50";
