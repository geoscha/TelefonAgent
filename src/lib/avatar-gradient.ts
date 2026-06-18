import { cn } from "@/lib/utils";

export type GradientVariant = "warm" | "cool";

export function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

export function getAvatarGradientVariant(name: string): GradientVariant {
  void name;
  return "cool";
}

export function getInitials(name: string): string {
  const trimmed = name.trim();
  if (trimmed.startsWith("+")) return "??";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

export const avatarGradientClasses: Record<GradientVariant, string> = {
  warm: "bg-[radial-gradient(circle_at_30%_30%,#FF9F24_0%,#FF6B1A_55%,#E85A10_100%)]",
  cool: "bg-[radial-gradient(circle_at_30%_30%,#C9D6DD_0%,#4D7496_55%,#16323F_100%)]",
};

export function getStatAccentVariant(index: number): GradientVariant {
  return index % 2 === 0 ? "warm" : "cool";
}

export function statAccentClass(variant: GradientVariant): string {
  return variant === "warm"
    ? "bg-[linear-gradient(90deg,#FF6B1A_0%,#FFE9D6_100%)]"
    : "bg-[linear-gradient(90deg,#16323F_0%,#C9D6DD_100%)]";
}

export function cnAvatar(variant: GradientVariant, className?: string) {
  return cn(avatarGradientClasses[variant], className);
}
