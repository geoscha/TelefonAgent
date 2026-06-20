import {
  Bot,
  CalendarDays,
  CreditCard,
  MessageSquare,
  Phone,
  PhoneCall,
  Plug,
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
  return pathname === href || pathname.startsWith(`${href}/`);
}
