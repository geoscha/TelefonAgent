"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  userLabelClass,
  userPanelClass,
  userTitleClass,
} from "@/components/user/user-styles";
import {
  billingPurchasesToCsv,
  billingPurchasesToExcelXml,
  downloadTextFile,
  formatChf,
  type BillingPurchaseEntry,
} from "@/lib/billing/billing-history-format";
import { cn } from "@/lib/utils";

export function BillingHistorySection() {
  const [purchases, setPurchases] = useState<BillingPurchaseEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/billing/history")
      .then(async (res) => {
        if (!res.ok) throw new Error("load_failed");
        return res.json() as Promise<{ purchases: BillingPurchaseEntry[] }>;
      })
      .then((data) => {
        if (!cancelled) setPurchases(data.purchases ?? []);
      })
      .catch(() => {
        if (!cancelled) toast.error("Abrechnungsverlauf konnte nicht geladen werden.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function exportCsv() {
    if (!purchases.length) return;
    downloadTextFile(
      billingPurchasesToCsv(purchases),
      "token-kaeufe.csv",
      "text/csv;charset=utf-8"
    );
  }

  function exportExcel() {
    if (!purchases.length) return;
    downloadTextFile(
      billingPurchasesToExcelXml(purchases),
      "token-kaeufe.xls",
      "application/vnd.ms-excel"
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className={userTitleClass}>Abrechnungsverlauf</p>
          <p className={`${userLabelClass} mt-0.5 text-[12px]`}>
            Jeder Token-Zukauf einzeln.
          </p>
        </div>
        {!loading && purchases.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={exportCsv} className={exportButtonClass}>
              <Download className="h-3 w-3" />
              CSV
            </button>
            <button type="button" onClick={exportExcel} className={exportButtonClass}>
              <Download className="h-3 w-3" />
              Excel
            </button>
          </div>
        )}
      </div>

      <div className={cn(userPanelClass, "overflow-hidden")}>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-[#525866]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="text-[12px] text-[#525866]">Lade Verlauf…</span>
          </div>
        ) : purchases.length === 0 ? (
          <p className="px-5 py-8 text-center text-[12px] text-[#525866]">
            Noch keine Token-Zukäufe vorhanden.
          </p>
        ) : (
          <ul>
            {purchases.map((purchase) => (
              <li
                key={purchase.id}
                className="flex items-center justify-between gap-4 border-b border-[#E1E4EA] px-5 py-2.5 last:border-0"
              >
                <span className="text-[12px] text-[#525866]">{purchase.label}</span>
                <span className="text-[12px] tabular-nums text-[#0E121B]">
                  CHF {formatChf(purchase.purchasedChf)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const exportButtonClass =
  "inline-flex items-center gap-1 rounded border border-[#E1E4EA] bg-white px-2.5 py-1 text-[11px] text-[#525866] transition-colors hover:bg-[#F5F7FA] hover:text-[#0E121B]";
