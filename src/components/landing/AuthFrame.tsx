import Link from "next/link";

import { LinkerLogo } from "@/components/brand/LinkerLogo";
import { cn } from "@/lib/utils";

interface AuthFrameProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  footer?: React.ReactNode;
  className?: string;
  showGoogle?: boolean;
  onGoogleClick?: () => void;
  googleLoading?: boolean;
  showLegal?: boolean;
}

export function AuthFrame({
  children,
  title,
  subtitle,
  footer,
  className,
  showGoogle = false,
  onGoogleClick,
  googleLoading = false,
  showLegal = true,
}: AuthFrameProps) {
  return (
    <div className="font-retell-sans flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_#E3EBF6_0%,_#F4F6FA_45%,_#FAFBFC_100%)] px-4 py-10">
      <div
        className={cn(
          "landing-radius w-full max-w-[440px] bg-white px-8 py-10 shadow-[0_8px_40px_rgba(14,18,27,0.08)] sm:px-10 sm:py-11",
          className
        )}
      >
        <div className="mb-8 flex justify-center">
          <LinkerLogo mode="contextual" theme="dark" size="md" href="/" />
        </div>

        <h1 className="text-center text-[26px] font-semibold leading-tight tracking-[-0.02em] text-[#0E121B]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 text-center text-[14px] leading-relaxed text-[#525866]">
            {subtitle}
          </p>
        )}

        <div className="mt-8">{children}</div>

        {footer && <div className="mt-6">{footer}</div>}

        {showGoogle && onGoogleClick && (
          <>
            <AuthOrDivider />
            <button
              type="button"
              onClick={onGoogleClick}
              disabled={googleLoading}
              className={authGoogleButtonClass}
            >
              <GoogleIcon />
              {googleLoading ? "Verbinden…" : "Mit Google fortfahren"}
            </button>
          </>
        )}

        {showLegal && (
          <p className="mt-8 text-center text-[12px] leading-relaxed text-[#99A0AE]">
            Mit der Anmeldung stimmen Sie unseren{" "}
            <Link href="#" className={authAccentLinkClass}>
              Nutzungsbedingungen
            </Link>{" "}
            und der{" "}
            <Link href="#" className={authAccentLinkClass}>
              Datenschutzerklärung
            </Link>{" "}
            zu.
          </p>
        )}
      </div>
    </div>
  );
}

function AuthOrDivider() {
  return (
    <div className="my-6 flex items-center gap-3">
      <span className="h-px flex-1 bg-[#E1E4EA]" aria-hidden />
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#99A0AE]">
        oder
      </span>
      <span className="h-px flex-1 bg-[#E1E4EA]" aria-hidden />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function AuthField({
  label,
  children,
  action,
  hideLabel,
}: {
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  hideLabel?: boolean;
}) {
  return (
    <div className="space-y-2">
      {!hideLabel && (
        <div className="flex items-center justify-between gap-3">
          <label className="text-[13px] font-medium text-[#0E121B]">{label}</label>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export const modalBackdropClass =
  "absolute inset-0 bg-black/10 backdrop-blur-md";

export const authInputClass =
  "flex h-11 w-full landing-radius-sm border border-[#E1E4EA] bg-white px-3.5 text-[14px] text-[#0E121B] placeholder:text-[#99A0AE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#335cff]/25 focus-visible:border-[#335cff] disabled:opacity-50";

export const authTextareaClass =
  "flex min-h-[72px] w-full resize-y landing-radius-sm border border-[#E1E4EA] bg-white px-3.5 py-3 text-[14px] leading-relaxed text-[#0E121B] placeholder:text-[#99A0AE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#335cff]/25 focus-visible:border-[#335cff] disabled:opacity-50";

export const authLinkClass =
  "text-[13px] font-medium text-[#335cff] transition-colors hover:text-[#2547d0]";

export const authAccentLinkClass =
  "font-medium text-[#335cff] transition-colors hover:text-[#2547d0]";

export const authButtonClass =
  "inline-flex h-11 w-full items-center justify-center landing-radius-sm bg-[#0E121B] text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50";

export const authButtonOutlineClass =
  "inline-flex h-11 w-full items-center justify-center landing-radius-sm border border-[#E1E4EA] bg-white text-[14px] font-medium text-[#0E121B] transition-colors hover:bg-[#F5F7FA] disabled:opacity-50";

export const authGoogleButtonClass =
  "inline-flex h-11 w-full items-center justify-center gap-2.5 landing-radius-sm border border-[#E1E4EA] bg-white text-[14px] font-medium text-[#0E121B] transition-colors hover:bg-[#F5F7FA] disabled:opacity-50";

export const authMutedTextClass = "text-[13px] text-[#525866]";

export const authErrorClass = "text-[13px] text-red-600";
