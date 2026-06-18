import {
  Bot,
  CreditCard,
  History,
  Key,
  Phone,
  Webhook,
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
  { href: "/anrufe", label: "Verlauf", icon: History },
  { href: "/api-keys", label: "API-Schlüssel", icon: Key },
  { href: "/billing", label: "Abrechnung", icon: CreditCard },
  { href: "/webhooks", label: "Webhooks", icon: Webhook },
];

export function isUserNavActive(pathname: string, href: string) {
  if (href === "/anrufe") {
    return pathname === "/anrufe" || pathname.startsWith("/anrufe/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
