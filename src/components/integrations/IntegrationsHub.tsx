"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { CalendarIntegrations } from "@/components/integrations/CalendarIntegrations";
import { MailIntegrations } from "@/components/integrations/MailIntegrations";
import { Input } from "@/components/ui/input";
import { PROVIDER_META } from "@/lib/calendar/provider-meta";
import { integrationSearchHasResults } from "@/lib/integrations/search";
import { MAIL_PROVIDER_META } from "@/lib/integrations/mail/provider-meta";
import { userPanelClass } from "@/components/user/user-styles";
import { cn } from "@/lib/utils";

export function IntegrationsHub() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const handledQuery = useRef(false);
  const [searchQuery, setSearchQuery] = useState("");

  const hasResults = useMemo(
    () => integrationSearchHasResults(searchQuery),
    [searchQuery]
  );

  useEffect(() => {
    if (handledQuery.current) return;

    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (!connected && !error) return;

    handledQuery.current = true;

    if (connected) {
      if (connected.startsWith("mail_")) {
        const provider = connected.replace("mail_", "") as keyof typeof MAIL_PROVIDER_META;
        const meta = MAIL_PROVIDER_META[provider];
        toast.success(meta ? `${meta.name} verbunden` : "E-Mail verbunden");
      } else {
        const meta = PROVIDER_META[connected as keyof typeof PROVIDER_META];
        toast.success(
          meta ? `${meta.name} verbunden` : "Integration verbunden"
        );
      }
    } else if (error) {
      const messages: Record<string, string> = {
        denied: "Verbindung abgebrochen.",
        state_mismatch: "Verbindung abgelaufen — bitte erneut versuchen.",
        exchange_failed: "Verbindung fehlgeschlagen.",
        unknown_provider: "Unbekannter Anbieter.",
      };
      toast.error("Verbindung fehlgeschlagen", {
        description: messages[error] ?? error,
      });
    }

    router.replace("/integrationen", { scroll: false });
  }, [searchParams, router]);

  return (
    <div className="flex h-[calc(100dvh-3.5rem-2rem)] w-full min-h-0 flex-col sm:h-[calc(100dvh-3.5rem-2.5rem)] lg:h-[calc(100dvh-3.5rem-3rem)]">
      <div
        className={cn(
          userPanelClass,
          "flex min-h-0 w-full flex-1 flex-col overflow-hidden p-5 sm:p-6"
        )}
      >
        <header className="flex shrink-0 flex-col gap-3 border-b border-[#E1E4EA] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-[22px] font-normal text-[#0E121B]">Integrationen</h1>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#99A0AE]" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Suchen"
              className="h-9 border-[#E1E4EA] bg-white pl-9 text-[13px] text-[#0E121B] placeholder:text-[#99A0AE] focus-visible:ring-[#335cff]/20"
              aria-label="Integrationen durchsuchen"
            />
          </div>
        </header>

        <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pb-2">
          {!hasResults ? (
            <p className="rounded-lg border border-[#E1E4EA] bg-[#FAFAFA] px-4 py-8 text-center text-[13px] text-[#99A0AE]">
              Keine Integrationen für «{searchQuery.trim()}» gefunden.
            </p>
          ) : (
            <>
              <CalendarIntegrations layout="page" bare searchQuery={searchQuery} />
              <MailIntegrations layout="page" bare searchQuery={searchQuery} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
