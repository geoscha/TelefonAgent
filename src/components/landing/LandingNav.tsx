import Link from "next/link";
import { CuraLogo } from "@/components/brand/CuraLogo";

export function LandingNav() {
  return (
    <header className="relative z-20 flex items-center justify-between px-4 pt-4 sm:px-6 sm:pt-5">
      <CuraLogo mode="contextual" theme="light" size="sm" href="/" />
      <Link
        href="/login"
        className="text-[13px] font-medium text-white/75 transition-colors hover:text-white sm:text-[14px]"
      >
        Anmelden
      </Link>
    </header>
  );
}
