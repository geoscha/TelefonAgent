"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  CreditCard,
  Phone,
  Sparkles,
} from "lucide-react";

import { AdminFilterPill, adminPanelClass, adminTableClass, adminTableHeadClass } from "@/components/admin/admin-ui";
import { groupVendorsByCategory, type FinanceVendorEntry } from "@/lib/admin/finance-vendor-types";
import { cn } from "@/lib/utils";

function chf(value: number, decimals = 0): string {
  return `CHF ${value.toLocaleString("de-CH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

const CATEGORY_ICONS = {
  telephony: Phone,
  ai: Sparkles,
  infrastructure: Cloud,
  payments: CreditCard,
} as const;

type VendorFilter = "all" | FinanceVendorEntry["category"];

function SourceBadge({
  source,
  configured,
}: {
  source: FinanceVendorEntry["dataSource"];
  configured: boolean;
}) {
  if (source === "api") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
        <CheckCircle2 className="h-3 w-3" />
        Live API
      </span>
    );
  }
  if (source === "estimate") {
    return (
      <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
        Schätzung
      </span>
    );
  }
  if (source === "manual") {
    return (
      <span className="inline-flex rounded-full bg-[#F0F4FF] px-2 py-0.5 text-[10px] font-medium text-[#335cff]">
        Manuell
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        configured
          ? "bg-amber-50 text-amber-700"
          : "bg-[#F5F7FA] text-[#99A0AE]"
      )}
    >
      {!configured && <AlertCircle className="h-3 w-3" />}
      {configured ? "Kosten fehlen" : "Nicht verbunden"}
    </span>
  );
}

export function FinanceVendorControlTower({
  vendors,
  totalCostChf,
}: {
  vendors: FinanceVendorEntry[];
  totalCostChf: number;
}) {
  const [filter, setFilter] = useState<VendorFilter>("all");

  const groups = useMemo(() => groupVendorsByCategory(vendors), [vendors]);

  const visibleGroups = useMemo(() => {
    if (filter === "all") return groups;
    return groups.filter((group) => group.category === filter);
  }, [filter, groups]);

  const unconfiguredCount = vendors.filter(
    (vendor) =>
      vendor.id !== "stripe" &&
      (vendor.dataSource === "unconfigured" ||
        (vendor.configured && vendor.monthlyCostChf <= 0 && vendor.dataSource !== "api"))
  ).length;

  return (
    <section className={`${adminPanelClass} overflow-hidden`}>
      <div className="border-b border-[#E1E4EA] px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#99A0AE]">
              Kosten-Cockpit
            </p>
            <h3 className="mt-1 text-lg font-medium tracking-tight text-[#0E121B]">
              Alle Anbieter & Konten
            </h3>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#525866]">
              Einheitliche Übersicht über Telefonie, KI, Cloud (Vercel, Supabase, Azure, GCP)
              und Zahlungsanbieter — mit Live-Daten, Schätzungen und manuellen Fixkosten.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-[#99A0AE]">
              Gesamtkosten / Monat
            </p>
            <p className="mt-0.5 text-2xl font-medium tabular-nums text-[#0E121B]">
              {chf(totalCostChf)}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <AdminFilterPill active={filter === "all"} onClick={() => setFilter("all")}>
            Alle
          </AdminFilterPill>
          {groups.map((group) => {
            const Icon = CATEGORY_ICONS[group.category];
            return (
              <AdminFilterPill
                key={group.category}
                active={filter === group.category}
                onClick={() => setFilter(group.category)}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5" />
                  {group.label}
                  <span className="text-[#99A0AE]">({group.vendors.length})</span>
                </span>
              </AdminFilterPill>
            );
          })}
        </div>

        {unconfiguredCount > 0 ? (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-[12px] text-amber-900">
            {unconfiguredCount} Anbieter ohne vollständige Kostenerfassung — trage Fixkosten als{" "}
            <code className="rounded bg-white/80 px-1 py-0.5 text-[11px]">
              FINANCE_*_MONTHLY_CHF
            </code>{" "}
            in Vercel ein oder verbinde APIs unter{" "}
            <Link href="/admin/settings" className="font-medium text-[#335cff] hover:underline">
              Einstellungen
            </Link>
            .
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className={adminTableClass}>
          <thead className={adminTableHeadClass}>
            <tr>
              <th className="px-4 py-2.5 font-medium">Anbieter</th>
              <th className="px-4 py-2.5 font-medium">Kategorie</th>
              <th className="px-4 py-2.5 font-medium text-right">Kosten / Mt.</th>
              <th className="px-4 py-2.5 font-medium text-right">Anteil</th>
              <th className="px-4 py-2.5 font-medium">Konto / Guthaben</th>
              <th className="px-4 py-2.5 font-medium">Quelle</th>
            </tr>
          </thead>
          <tbody>
            {visibleGroups.flatMap((group) => [
              <tr key={`${group.category}-header`} className="bg-[#FAFBFC]">
                <td
                  colSpan={6}
                  className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#525866]"
                >
                  {group.label} · {chf(group.totalChf)}
                </td>
              </tr>,
              ...group.vendors.map((vendor) => (
                <tr
                  key={vendor.id}
                  className="border-t border-[#E1E4EA] hover:bg-[#FAFBFC]/80"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#0E121B]">{vendor.provider}</p>
                    <p className="text-[12px] text-[#525866]">{vendor.name}</p>
                    {vendor.settingsHint ? (
                      <p className="mt-1 text-[11px] text-[#99A0AE]">{vendor.settingsHint}</p>
                    ) : null}
                    {vendor.error ? (
                      <p className="mt-1 text-[11px] text-red-600">{vendor.error}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[#525866]">
                    {vendor.billingHint}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#0E121B]">
                    {vendor.id === "stripe" ? (
                      <span className="text-emerald-700">{vendor.balanceValue ?? "—"}</span>
                    ) : vendor.monthlyCostChf > 0 ? (
                      chf(vendor.monthlyCostChf, vendor.dataSource === "api" ? 2 : 0)
                    ) : (
                      <span className="text-[#99A0AE]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#525866]">
                    {vendor.id === "stripe"
                      ? "—"
                      : vendor.monthlyCostChf > 0
                        ? `${vendor.sharePct.toFixed(0)}%`
                        : "—"}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[#525866]">
                    {vendor.balanceLabel && vendor.balanceValue ? (
                      <>
                        <span className="text-[11px] text-[#99A0AE]">
                          {vendor.balanceLabel}:{" "}
                        </span>
                        {vendor.balanceValue}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <SourceBadge
                      source={vendor.dataSource}
                      configured={vendor.configured}
                    />
                  </td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    </section>
  );
}
