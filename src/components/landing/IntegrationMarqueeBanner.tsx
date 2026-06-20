"use client";

import Image from "next/image";

import { LANDING_INTEGRATION_MARQUEE } from "@/lib/integrations/integration-logos";
import { cn } from "@/lib/utils";

export function IntegrationMarqueeBanner({ className }: { className?: string }) {
  const logos = [...LANDING_INTEGRATION_MARQUEE, ...LANDING_INTEGRATION_MARQUEE];

  return (
    <section
      className={cn("bg-white py-4 sm:py-5", className)}
      aria-label="Plug-ins und Integrationen"
    >
      <div className="relative overflow-hidden">
        <div className="integration-marquee-track gap-10 sm:gap-14">
          {logos.map((logo, index) => (
            <div
              key={`${logo.src}-${index}`}
              className="flex shrink-0 items-center justify-center px-1"
            >
              <Image
                src={logo.src}
                alt=""
                width={logo.width}
                height={logo.height}
                unoptimized
                className="integration-marquee-logo h-7 w-auto max-w-[108px] object-contain sm:h-8"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
