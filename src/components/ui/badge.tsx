import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-btn border px-2 py-0.5 text-caption font-medium",
  {
    variants: {
      variant: {
        default: "border-stroke bg-baby-blue/50 text-steel-blue",
        schaden: "border-blue-tint bg-light-blue text-steel-blue",
        mietzins: "border-blue-tint bg-baby-blue text-steel-blue",
        besichtigung: "border-stroke bg-light-blue text-navy",
        allgemein: "border-stroke bg-bg text-text-muted",
        notfall: "border-red-200 bg-red-50 text-red-700",
        urgent: "border-red-200 bg-red-50 text-red-700",
        success: "border-stroke bg-baby-blue/60 text-steel-blue",
        warning: "border-stroke bg-light-blue text-steel-blue",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
