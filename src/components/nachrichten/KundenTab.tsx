"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Database, RefreshCw, SlidersHorizontal } from "lucide-react";

import { CustomerDetailPanel } from "@/components/nachrichten/CustomerDetailPanel";
import { CustomersSidebar } from "@/components/nachrichten/CustomersSidebar";
import { CustomerSourcePicker } from "@/components/nachrichten/CustomerSourcePicker";
import { EmptyState } from "@/components/brand/EmptyState";
import { landingBtnPrimary } from "@/components/landing/landing-buttons";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type CustomersFeed,
  prefetchCustomersFeed,
} from "@/lib/client/tab-prefetch";
import { CACHE_KEYS } from "@/lib/client/stale-cache";
import { useStaleFetch } from "@/lib/hooks/useStaleFetch";
import { cn } from "@/lib/utils";
import {
  PROPERTY_SOFTWARE_PROVIDER_META,
  type PropertySoftwareProviderId,
} from "@/lib/integrations/property-software/provider-meta";
import type { CustomerDataProviderId } from "@/lib/customers/types";
import { CUSTOMER_DATA_PROVIDERS } from "@/lib/customers/types";

const PAGE_SHELL_CLASS =
  "flex min-h-[calc(100dvh-3.5rem-2rem)] gap-3 sm:min-h-[calc(100dvh-3.5rem-2.5rem)] lg:min-h-[calc(100dvh-3.5rem-3rem)]";

async function fetchCustomersFeed(): Promise<CustomersFeed> {
  const res = await fetch("/api/customers");
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error("customers load failed");
  return {
    customers: data.customers ?? [],
    craftsmen: data.craftsmen ?? [],
    connected: Boolean(data.connected),
    calendarConnected: Boolean(data.calendarConnected),
    lastSyncedAt: (data.lastSyncedAt as string | undefined) ?? null,
    sourceReady: Boolean(data.sourceReady),
    activeProvider:
      (data.activeProvider as CustomerDataProviderId | undefined) ?? null,
  };
}

function formatSyncedAt(iso: string | null): string {
  if (!iso) return "noch nie synchronisiert";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "noch nie synchronisiert";
  return `zuletzt synchronisiert: ${date.toLocaleString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function KundenTab() {
  const {
    data: feed,
    loading,
    revalidating,
    revalidate,
  } = useStaleFetch<CustomersFeed>(CACHE_KEYS.customers, fetchCustomersFeed, {
    ttlMs: 60_000,
  });

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null
  );
  const [selectedCraftsmanId, setSelectedCraftsmanId] = useState<string | null>(
    null
  );
  const [customersOpen, setCustomersOpen] = useState(false);
  const [craftsmenOpen, setCraftsmenOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [sourceEditorOpen, setSourceEditorOpen] = useState(false);
  const [sourceEditorMounted, setSourceEditorMounted] = useState(false);

  const customers = feed?.customers ?? [];
  const craftsmen = feed?.craftsmen ?? [];
  const connected = feed?.connected ?? false;
  const calendarConnected = feed?.calendarConnected ?? false;
  const lastSyncedAt = feed?.lastSyncedAt ?? null;
  const sourceReady = feed?.sourceReady ?? false;
  const activeProvider = feed?.activeProvider ?? null;

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await fetch("/api/customers/sync", { method: "POST" });
      await prefetchCustomersFeed();
      await revalidate();
    } catch {
      setLoadError("Synchronisierung fehlgeschlagen.");
    } finally {
      setSyncing(false);
    }
  }, [revalidate]);

  useEffect(() => {
    if (sourceEditorOpen) setSourceEditorMounted(true);
  }, [sourceEditorOpen]);

  useEffect(() => {
    if (
      selectedCustomerId &&
      !customers.some((customer) => customer.id === selectedCustomerId)
    ) {
      setSelectedCustomerId(null);
    }
    if (
      selectedCraftsmanId &&
      !craftsmen.some((craftsman) => craftsman.id === selectedCraftsmanId)
    ) {
      setSelectedCraftsmanId(null);
    }
  }, [customers, craftsmen, selectedCustomerId, selectedCraftsmanId]);

  const selectedRecord = useMemo(() => {
    if (selectedCraftsmanId && craftsmenOpen) {
      return craftsmen.find((craftsman) => craftsman.id === selectedCraftsmanId) ?? null;
    }
    if (selectedCustomerId && customersOpen) {
      return customers.find((customer) => customer.id === selectedCustomerId) ?? null;
    }
    return null;
  }, [
    customers,
    craftsmen,
    customersOpen,
    craftsmenOpen,
    selectedCustomerId,
    selectedCraftsmanId,
  ]);

  const activeProviderLabel = useMemo(() => {
    if (!activeProvider) return null;
    return (
      PROPERTY_SOFTWARE_PROVIDER_META[
        activeProvider as PropertySoftwareProviderId
      ]?.name ?? null
    );
  }, [activeProvider]);

  useEffect(() => {
    if (!loading && !sourceReady) {
      setSourceEditorMounted(true);
      setSourceEditorOpen(true);
    }
  }, [loading, sourceReady]);

  if (loading && !feed) {
    return (
      <div className={PAGE_SHELL_CLASS}>
        <Skeleton className="h-full w-[200px] shrink-0 rounded lg:w-[220px]" />
        <Skeleton className="min-h-0 flex-1 self-stretch rounded" />
      </div>
    );
  }

  if (!connected) {
    return (
      <div className={PAGE_SHELL_CLASS}>
        <div className="landing-panel flex min-h-0 flex-1 flex-col items-center justify-center border border-[#E1E4EA] p-8">
        <EmptyState
          illustration="integrations"
          title="Kundendaten benötigen eine Integration"
          description="Verbinden Sie ImmoTop2, Rimo R5, GARAIO REM, Fairwalter oder Microsoft Excel — dort sind Ihre Mieter- und Kundenstammdaten gespeichert. Linker importiert die Namen und zeigt Details sowie Termine an."
        />
        <div className="mt-6 flex max-w-lg flex-wrap items-center justify-center gap-2">
          {CUSTOMER_DATA_PROVIDERS.map((providerId) => (
            <span
              key={providerId}
              className="rounded-full border border-[#E1E4EA] bg-[#FAFAFA] px-3 py-1 text-[12px] text-[#525866]"
            >
              {PROPERTY_SOFTWARE_PROVIDER_META[providerId as PropertySoftwareProviderId].name}
            </span>
          ))}
        </div>
        <Link href="/integrationen" className={`${landingBtnPrimary} mt-6`}>
          Integration verbinden
        </Link>
        {loadError ? (
          <p className="mt-4 text-[12px] text-[#99A0AE]">{loadError}</p>
        ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#E1E4EA] bg-[#FAFAFA] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-[12px] text-[#525866]">
          <Database className="h-4 w-4 shrink-0 text-[#99A0AE]" />
          <span className="min-w-0 truncate">
            <span className="font-medium text-[#0E121B]">
              {activeProviderLabel ?? "Keine Quelle"}
            </span>
            {" · "}
            {customers.length} Mieter
            {craftsmen.length > 0 ? ` · ${craftsmen.length} Handwerker` : ""}
            {" · "}
            {formatSyncedAt(lastSyncedAt)}
            {revalidating ? " · aktualisiere…" : null}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => void syncNow()}
            disabled={syncing || !sourceReady}
            title="Jetzt synchronisieren"
            aria-label="Jetzt synchronisieren"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#E1E4EA] bg-white text-[#525866] transition hover:bg-[#F5F5F5] hover:text-[#0E121B] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", (syncing || revalidating) && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={() => {
              setSourceEditorMounted(true);
              setSourceEditorOpen((open) => !open);
            }}
            title="Datenquelle verwalten"
            aria-label="Datenquelle verwalten"
            aria-expanded={sourceEditorOpen}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-md border transition",
              sourceEditorOpen
                ? "border-[#335cff] bg-[#F0F4FF] text-[#335cff]"
                : "border-[#E1E4EA] bg-white text-[#525866] hover:bg-[#F5F5F5] hover:text-[#0E121B]"
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      {sourceEditorMounted ? (
        <div className={cn(!sourceEditorOpen && "hidden")}>
          <CustomerSourcePicker
            initialActiveProvider={activeProvider}
            onSaved={() => {
              setSourceEditorOpen(false);
              void syncNow();
            }}
            onClose={sourceReady ? () => setSourceEditorOpen(false) : undefined}
          />
        </div>
      ) : null}

      <div className={PAGE_SHELL_CLASS}>
        <CustomersSidebar
          customers={customers}
          craftsmen={craftsmen}
          selectedCustomerId={selectedCustomerId}
          selectedCraftsmanId={selectedCraftsmanId}
          customersOpen={customersOpen}
          craftsmenOpen={craftsmenOpen}
          onCustomersOpenChange={(open) => {
            setCustomersOpen(open);
            if (!open) setSelectedCustomerId(null);
          }}
          onCraftsmenOpenChange={(open) => {
            setCraftsmenOpen(open);
            if (!open) setSelectedCraftsmanId(null);
          }}
          onSelectCustomer={(customerId) => {
            setSelectedCustomerId(customerId);
            setSelectedCraftsmanId(null);
          }}
          onSelectCraftsman={(craftsmanId) => {
            setSelectedCraftsmanId(craftsmanId);
            setSelectedCustomerId(null);
          }}
        />
        {!sourceReady ? (
          <div className="landing-panel flex min-h-0 flex-1 flex-col items-center justify-center border border-[#E1E4EA] p-8">
            <EmptyState
              illustration="integrations"
              title="Datenquelle auswählen"
              description="Wählen Sie oben genau eine verbundene Quelle (Excel, ImmoTop2, Rimo R5, …) und klicken Sie auf «Quelle koppeln», um Mieter und Handwerker zu synchronisieren."
              subtle
            />
          </div>
        ) : customers.length === 0 && craftsmen.length === 0 ? (
          <div className="landing-panel flex min-h-0 flex-1 flex-col items-center justify-center border border-[#E1E4EA] p-8">
            <EmptyState
              illustration="integrations"
              title="Keine Daten gefunden"
              description="Die verbundene Integration liefert noch keine Mieter- oder Handwerkerdaten — oder die Berechtigungen reichen nicht aus. Prüfen Sie die Verbindung unter Integrationen oder starten Sie eine manuelle Synchronisierung."
              subtle
            />
            <Link href="/integrationen" className={`${landingBtnPrimary} mt-4`}>
              Integrationen prüfen
            </Link>
          </div>
        ) : !selectedRecord ? (
          <div className="landing-panel flex min-h-0 flex-1 flex-col items-center justify-center border border-[#E1E4EA] p-8">
            <EmptyState
              illustration="integrations"
              title="Eintrag auswählen"
              description="Wählen Sie einen Mieter oder Handwerker in der Liste links."
              subtle
            />
          </div>
        ) : (
          <CustomerDetailPanel
            customer={selectedRecord}
            calendarConnected={calendarConnected}
          />
        )}
      </div>
    </div>
  );
}
