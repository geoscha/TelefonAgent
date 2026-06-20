import {
  Bot,
  CalendarDays,
  CreditCard,
  History,
  Phone,
  Plug,
  type LucideIcon,
} from "lucide-react";

export type UserNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const USER_NAV_ITEMS: UserNavItem[] = [
  { href: "/telefonagent", label: "KI-Agenten", icon: Bot },
  { href: "/phones", label: "Telefonnummern", icon: Phone },
  { href: "/kalender", label: "Kalender", icon: CalendarDays },
  { href: "/anrufe", label: "Verlauf", icon: History },
  { href: "/integrationen", label: "Integrationen", icon: Plug },
  { href: "/billing", label: "Abrechnung", icon: CreditCard },
];

export function isUserNavActive(pathname: string, href: string) {
  if (href === "/anrufe") {
    return pathname === "/anrufe" || pathname.startsWith("/anrufe/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
