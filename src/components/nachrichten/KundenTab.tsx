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
import { cn } from "@/lib/utils";
import {
  PROPERTY_SOFTWARE_PROVIDER_META,
  type PropertySoftwareProviderId,
} from "@/lib/integrations/property-software/provider-meta";
import type {
  CustomerDataProviderId,
  CustomerWithAppointments,
} from "@/lib/customers/types";
import { CUSTOMER_DATA_PROVIDERS } from "@/lib/customers/types";

const PAGE_SHELL_CLASS =
  "flex min-h-[calc(100dvh-3.5rem-2rem)] gap-3 sm:min-h-[calc(100dvh-3.5rem-2.5rem)] lg:min-h-[calc(100dvh-3.5rem-3rem)]";

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
  const [customers, setCustomers] = useState<CustomerWithAppointments[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [sourceReady, setSourceReady] = useState(false);
  const [activeProvider, setActiveProvider] =
    useState<CustomerDataProviderId | null>(null);
  const [sourceEditorOpen, setSourceEditorOpen] = useState(false);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/customers");
      const data = await res.json();
      if (res.ok && data.ok) {
        setCustomers((data.customers ?? []) as CustomerWithAppointments[]);
        setConnected(Boolean(data.connected));
        setCalendarConnected(Boolean(data.calendarConnected));
        setLastSyncedAt((data.lastSyncedAt as string | undefined) ?? null);
        setSourceReady(Boolean(data.sourceReady));
        setActiveProvider(
          (data.activeProvider as CustomerDataProviderId | undefined) ?? null
        );
      } else {
        setCustomers([]);
        setConnected(false);
        setLoadError(data.error ?? "Kunden konnten nicht geladen werden.");
      }
    } catch {
      setCustomers([]);
      setConnected(false);
      setLoadError("Netzwerkfehler beim Laden der Kunden.");
    } finally {
      setLoading(false);
    }
  }, []);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await fetch("/api/customers/sync", { method: "POST" });
    } catch {
      // ignore — reload surfaces any persisted state
    } finally {
      setSyncing(false);
      await loadCustomers();
    }
  }, [loadCustomers]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    if (customers.length > 0 && !selectedCustomerId) {
      setSelectedCustomerId(customers[0].id);
    }
    if (
      selectedCustomerId &&
      !customers.some((customer) => customer.id === selectedCustomerId)
    ) {
      setSelectedCustomerId(customers[0]?.id ?? null);
    }
  }, [customers, selectedCustomerId]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId]
  );

  const activeProviderLabel = useMemo(() => {
    if (!activeProvider) return null;
    return (
      PROPERTY_SOFTWARE_PROVIDER_META[
        activeProvider as PropertySoftwareProviderId
      ]?.name ?? null
    );
  }, [activeProvider]);

  // No configured source yet → open the picker right away so the user
  // immediately sees how to connect their customer database.
  useEffect(() => {
    if (!loading && !sourceReady) setSourceEditorOpen(true);
  }, [loading, sourceReady]);

  if (loading) {
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
            {customers.length} Kunden · {formatSyncedAt(lastSyncedAt)}
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
            <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={() => setSourceEditorOpen((open) => !open)}
            title="Kundendatenbank verwalten"
            aria-label="Kundendatenbank verwalten"
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

      {sourceEditorOpen ? (
        <CustomerSourcePicker
          onSaved={() => {
            setSourceEditorOpen(false);
            void syncNow();
          }}
          onClose={sourceReady ? () => setSourceEditorOpen(false) : undefined}
        />
      ) : null}

      <div className={PAGE_SHELL_CLASS}>
        <CustomersSidebar
          customers={customers}
          selectedCustomerId={selectedCustomerId}
          onSelect={setSelectedCustomerId}
        />
        {!sourceReady ? (
          <div className="landing-panel flex min-h-0 flex-1 flex-col items-center justify-center border border-[#E1E4EA] p-8">
            <EmptyState
              illustration="integrations"
              title="Kundendatenbank auswählen"
              description="Wählen Sie oben genau eine verbundene Quelle (Excel, ImmoTop2, Rimo R5, …) und klicken Sie auf «Quelle koppeln», um Kunden zu synchronisieren."
              subtle
            />
          </div>
        ) : customers.length === 0 ? (
          <div className="landing-panel flex min-h-0 flex-1 flex-col items-center justify-center border border-[#E1E4EA] p-8">
            <EmptyState
              illustration="integrations"
              title="Keine Kunden gefunden"
              description="Die verbundene Integration liefert noch keine Kundendaten — oder die Berechtigungen reichen nicht aus. Prüfen Sie die Verbindung unter Integrationen oder starten Sie eine manuelle Synchronisierung."
              subtle
            />
            <Link href="/integrationen" className={`${landingBtnPrimary} mt-4`}>
              Integrationen prüfen
            </Link>
          </div>
        ) : (
          <CustomerDetailPanel
            customer={selectedCustomer}
            calendarConnected={calendarConnected}
          />
        )}
      </div>
    </div>
  );
}
