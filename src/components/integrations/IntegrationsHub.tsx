"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { CalendarIntegrations } from "@/components/integrations/CalendarIntegrations";
import { PROVIDER_META } from "@/lib/calendar/provider-meta";
import { userPanelClass } from "@/components/user/user-styles";
import { cn } from "@/lib/utils";

export function IntegrationsHub() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const handledQuery = useRef(false);

  useEffect(() => {
    if (handledQuery.current) return;

    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (!connected && !error) return;

    handledQuery.current = true;

    if (connected) {
      const meta = PROVIDER_META[connected as keyof typeof PROVIDER_META];
      toast.success(
        meta ? `${meta.name} verbunden` : "Integration verbunden"
      );
    } else if (error) {
      const messages: Record<string, string> = {
        denied: "Kalender-Verbindung abgebrochen.",
        state_mismatch: "Kalender-Verbindung abgelaufen — bitte erneut versuchen.",
        exchange_failed: "Kalender-Verbindung fehlgeschlagen.",
        unknown_provider: "Unbekannter Kalender-Anbieter.",
      };
      toast.error("Verbindung fehlgeschlagen", {
        description: messages[error] ?? error,
      });
    }

    router.replace("/integrationen", { scroll: false });
  }, [searchParams, router]);

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col">
      <div className={cn(userPanelClass, "flex w-full flex-1 flex-col p-5 sm:p-6")}>
        <header className="border-b border-[#E1E4EA] pb-4">
          <h1 className="text-[22px] font-normal text-[#0E121B]">Integrationen</h1>
        </header>

        <div className="mt-4 w-full">
          <CalendarIntegrations layout="page" />
        </div>
      </div>
    </div>
  );
}
