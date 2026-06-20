"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LinkerLogo } from "@/components/brand/LinkerLogo";
import {
  isUserNavActive,
  USER_NAV_ITEMS,
} from "@/components/layout/user-nav";
import {
  SidebarSupportButton,
  SidebarSupportIcon,
} from "@/components/support/SidebarSupportButton";
import { cn } from "@/lib/utils";

export function UserSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-[#E1E4EA] bg-white px-3 py-4 lg:w-[240px]">
      <div className="mb-6 px-1">
        <LinkerLogo mode="contextual" theme="dark" size="sm" href="/anrufe" />
      </div>

      <nav className="flex flex-1 flex-col gap-0.5" aria-label="Hauptnavigation">
        {USER_NAV_ITEMS.map((item) => {
          const active = isUserNavActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "landing-body flex items-center gap-2.5 landing-radius-sm px-3 py-2.5 transition-colors",
                active
                  ? "bg-[#F5F7FA] font-medium text-[#0E121B]"
                  : "text-[#525866] hover:bg-[#F5F7FA] hover:text-[#0E121B]"
              )}
            >
              <Icon
                className={cn(
                  "h-[17px] w-[17px] shrink-0 stroke-[1.5]",
                  active ? "text-[#335cff]" : "text-[#99A0AE]"
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 landing-radius border border-[#E1E4EA] bg-[#F5F7FA] p-4">
        <div className="mb-3 flex justify-center text-[#99A0AE]" aria-hidden>
          <SidebarSupportIcon />
        </div>
        <SidebarSupportButton />
      </div>
    </aside>
  );
}
