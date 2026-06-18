import { getInitials } from "@/lib/avatar-gradient";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  name: string;
  size?: "sm" | "md";
  className?: string;
}

const sizeMap = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-9 w-9 text-[12px]",
};

/** Flat avatar for the app shell — no gradient. */
export function UserAvatar({ name, size = "sm", className }: UserAvatarProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-[#EBEEF4] font-normal text-[#525866]",
        sizeMap[size],
        className
      )}
      aria-hidden
    >
      {getInitials(name)}
    </div>
  );
}
