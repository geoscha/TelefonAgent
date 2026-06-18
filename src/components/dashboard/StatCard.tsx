import { cn } from "@/lib/utils";
import type { GradientVariant } from "@/lib/avatar-gradient";
import { statAccentClass } from "@/lib/avatar-gradient";

interface StatCardProps {
  label: string;
  value: string;
  trend?: string;
  accent?: GradientVariant;
  className?: string;
}

export function StatCard({
  label,
  value,
  trend,
  accent = "warm",
  className,
}: StatCardProps) {
  return (
    <div className={cn("relative overflow-hidden bg-surface", className)}>
      <div
        className={cn("absolute inset-x-0 top-0 h-[3px]", statAccentClass(accent))}
        aria-hidden
      />
      <div
        className={cn(
          "pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[0.07]",
          accent === "warm"
            ? "bg-[radial-gradient(circle,#FF6B1A_0%,transparent_70%)]"
            : "bg-[radial-gradient(circle,#16323F_0%,transparent_70%)]"
        )}
        aria-hidden
      />
      <div className="relative px-6 py-6 lg:px-8 lg:py-7">
        <p className="label-caps">{label}</p>
        <p className="stat-value mt-2">{value}</p>
        {trend && (
          <p className="mt-2 text-caption text-text-muted">{trend}</p>
        )}
      </div>
    </div>
  );
}
