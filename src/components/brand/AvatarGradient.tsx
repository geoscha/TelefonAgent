import { cn } from "@/lib/utils";
import {
  avatarGradientClasses,
  getAvatarGradientVariant,
  getInitials,
} from "@/lib/avatar-gradient";

interface AvatarGradientProps {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: "h-9 w-9 text-[13px]",
  md: "h-11 w-11 text-[14px]",
  lg: "h-14 w-14 text-[18px]",
};

export function AvatarGradient({ name, size = "md", className }: AvatarGradientProps) {
  const variant = getAvatarGradientVariant(name);
  const initials = getInitials(name);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-sans font-semibold text-white",
        avatarGradientClasses[variant],
        sizeMap[size],
        className
      )}
      aria-hidden
    >
      {initials}
    </div>
  );
}
