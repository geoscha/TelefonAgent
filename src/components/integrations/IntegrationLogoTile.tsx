"use client";

import Image from "next/image";

import { cn } from "@/lib/utils";

export type IntegrationLogoFit = "contain" | "cover";

interface IntegrationLogoTileProps {
  src: string;
  width: number;
  height: number;
  fit?: IntegrationLogoFit;
  className?: string;
  title?: string;
}

export function IntegrationLogoTile({
  src,
  width,
  height,
  fit = "contain",
  className,
  title,
}: IntegrationLogoTileProps) {
  const isCover = fit === "cover";

  return (
    <div
      title={title}
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#E1E4EA]/80 bg-white",
        isCover ? "p-0" : "p-0.5",
        className
      )}
    >
      <Image
        src={src}
        alt=""
        width={width}
        height={height}
        unoptimized
        className={cn(
          "h-full w-full",
          isCover ? "object-cover" : "object-contain"
        )}
        aria-hidden
      />
    </div>
  );
}
