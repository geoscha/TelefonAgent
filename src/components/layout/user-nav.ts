import {
  Bot,
  CalendarDays,
  CreditCard,
  MessageSquare,
  Phone,
  PhoneCall,
  Plug,
  Users,
  type LucideIcon,
} from "lucide-react";

export type UserNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const USER_NAV_ITEMS: UserNavItem[] = [
  { href: "/anrufe", label: "Anrufe", icon: PhoneCall },
  { href: "/nachrichten", label: "Nachrichten", icon: MessageSquare },
  { href: "/kunden", label: "Daten", icon: Users },
  { href: "/telefonagent", label: "KI-Assistenten", icon: Bot },
  { href: "/phones", label: "Telefonnummern", icon: Phone },
  { href: "/kalender", label: "Kalender", icon: CalendarDays },
  { href: "/integrationen", label: "Integrationen", icon: Plug },
  { href: "/billing", label: "Abrechnung", icon: CreditCard },
];

export function isUserNavActive(pathname: string, href: string) {
  if (href === "/anrufe") {
    return pathname === "/anrufe" || pathname.startsWith("/anrufe/");
  }
  if (href === "/nachrichten") {
    return pathname === "/nachrichten" || pathname.startsWith("/nachrichten/");
  }
  if (href === "/kunden") {
    return pathname === "/kunden" || pathname.startsWith("/kunden/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
