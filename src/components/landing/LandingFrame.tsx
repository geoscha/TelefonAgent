import { cn } from "@/lib/utils";

interface LandingFrameProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export function LandingFrame({
  children,
  className,
  contentClassName,
}: LandingFrameProps) {
  return (
    <div className={cn("min-h-screen bg-bg p-2 sm:p-2.5", className)}>
      <div
        className={cn(
          "landing-gradient landing-radius relative flex min-h-[calc(100vh-16px)] flex-col overflow-hidden sm:min-h-[calc(100vh-20px)]",
          contentClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}
