"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  AdminFilterPill,
  AdminStat,
  adminPanelClass,
  adminTableClass,
  adminTableHeadClass,
} from "@/components/admin/admin-ui";
import { TwilioNumberOrderPanel } from "@/components/admin/TwilioNumberOrderPanel";
import { Badge } from "@/components/ui/badge";
import { landingBtnPrimary } from "@/components/landing/landing-buttons";
import { landingInputClass } from "@/components/landing/landing-buttons";

interface AdminPoolNumber {
  phoneNumber: string;
  elevenLabsPhoneNumberId: string;
  status: "frei" | "belegt" | "zurückgegeben";
  assignedUserName?: string;
  assignedUserEmail?: string;
  assignedAt?: string;
  timesAssigned: number;
  lastReleasedAt?: string;
  inDatabase: boolean;
}

const STATUS_LABEL: Record<AdminPoolNumber["status"], string> = {
  frei: "Frei",
  belegt: "Belegt",
  zurückgegeben: "Zurückgegeben",
};

const STATUS_VARIANT: Record<
  AdminPoolNumber["status"],
  "success" | "default" | "warning"
> = {
  frei: "success",
  belegt: "default",
  zurückgegeben: "warning",
};

export default function AdminNumbersPage() {
  const [numbers, setNumbers] = useState<AdminPoolNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<
    "all" | "frei" | "belegt" | "zurückgegeben"
  >("all");
  const [copied, setCopied] = useState<string | null>(null);
  const [newNumbers, setNewNumbers] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/numbers");
      const data = await res.json();
      if (res.ok && data.ok) {
        setNumbers(data.numbers as AdminPoolNumber[]);
      } else {
        toast.error("Nummern konnten nicht geladen werden.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    toast.success("Kopiert");
    setTimeout(() => setCopied(null), 2000);
  }

  async function copyAllFree() {
    const free = numbers
      .filter((n) => n.status === "frei")
      .map((n) => n.phoneNumber)
      .join("\n");
    if (!free) {
      toast.info("Keine freien Nummern.");
      return;
    }
    await copyText(free, "all-free");
  }

  async function addNumbers() {
    const lines = newNumbers
      .split(/[\n,;]+/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      toast.error("Nummer eingeben.");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/admin/numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumbers: lines }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        const added = (data.added as string[])?.length ?? 0;
        const assigned = data.assignedCount as number;
        const skipped = (data.skipped as { phone: string; reason: string }[]) ?? [];
        if (added > 0) {
          toast.success(
            assigned > 0
              ? `${added} hinzugefügt · ${assigned} zugewiesen`
              : `${added} hinzugefügt`
          );
          setNewNumbers("");
          await load();
        }
        if (skipped.length > 0) {
          const labels: Record<string, string> = {
            duplicate_input: "doppelt",
            already_free: "bereits im Pool",
            already_used: "belegt",
            demo_reserved: "Demo-Nummer",
          };
          toast.warning(
            skipped
              .map((s) => `${s.phone} (${labels[s.reason] ?? s.reason})`)
              .join(", ")
          );
        }
      } else {
        toast.error(data.error ?? "Fehlgeschlagen.");
      }
    } finally {
      setAdding(false);
    }
  }

  const filtered = numbers.filter((n) => filter === "all" || n.status === filter);
  const freeCount = numbers.filter((n) => n.status === "frei").length;
  const usedCount = numbers.filter((n) => n.status === "belegt").length;
  const returnedCount = numbers.filter(
    (n) => n.status === "zurückgegeben"
  ).length;

  return (
    <div className="space-y-4">
      <TwilioNumberOrderPanel onOrdered={load} />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copyAllFree}
          className="landing-caption landing-radius-sm inline-flex min-h-8 items-center gap-1.5 border border-[#E1E4EA] px-2.5 text-[#525866] transition-colors hover:bg-[#F5F7FA] hover:text-[#0E121B]"
        >
          <Copy className="h-3.5 w-3.5" />
          Freie kopieren
        </button>
      </div>

      <div className={`${adminPanelClass} p-4 space-y-3`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <textarea
            id="new-numbers"
            className={`${landingInputClass} min-h-[64px] flex-1 font-mono landing-caption resize-y`}
            placeholder="+41…"
            value={newNumbers}
            onChange={(e) => setNewNumbers(e.target.value)}
          />
          <button
            type="button"
            onClick={addNumbers}
            disabled={adding}
            className={landingBtnPrimary}
          >
            {adding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Hinzufügen
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <AdminStat label="Gesamt" value={numbers.length} />
        <AdminStat label="Frei" value={freeCount} accent />
        <AdminStat label="Zurückgegeben" value={returnedCount} />
        <AdminStat label="Belegt" value={usedCount} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["all", "frei", "zurückgegeben", "belegt"] as const).map((f) => (
          <AdminFilterPill
            key={f}
            active={filter === f}
            onClick={() => setFilter(f)}
          >
            {f === "all"
              ? "Alle"
              : f === "frei"
                ? "Frei"
                : f === "belegt"
                  ? "Belegt"
                  : "Zurückgegeben"}
          </AdminFilterPill>
        ))}
      </div>

      <div className={`overflow-hidden ${adminPanelClass}`}>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[#525866]">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="landing-caption">Laden…</span>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center landing-body text-[#525866]">—</p>
        ) : (
          <table className={adminTableClass}>
            <thead>
              <tr className={adminTableHeadClass}>
                <th className="px-3 py-2.5 font-normal">Nummer</th>
                <th className="px-3 py-2.5 font-normal">Status</th>
                <th className="px-3 py-2.5 font-normal">User</th>
                <th className="px-3 py-2.5 font-normal">Zugewiesen</th>
                <th className="px-3 py-2.5 font-normal">Freigegeben</th>
                <th className="px-3 py-2.5 font-normal w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E1E4EA]">
              {filtered.map((n) => (
                <tr key={n.phoneNumber} className="hover:bg-[#F5F7FA]/60">
                  <td className="px-3 py-2.5 font-mono text-[#0E121B]">
                    {n.phoneNumber}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={STATUS_VARIANT[n.status]}>
                      {STATUS_LABEL[n.status]}
                    </Badge>
                    {n.timesAssigned > 1 && (
                      <p className="mt-0.5 landing-caption text-[#99A0AE]">
                        {n.timesAssigned}×
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {n.status === "belegt" ? (
                      <>
                        <p className="text-[#0E121B]">{n.assignedUserName || "—"}</p>
                        <p className="landing-caption text-[#99A0AE]">
                          {n.assignedUserEmail}
                        </p>
                      </>
                    ) : (
                      <span className="text-[#99A0AE]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 landing-caption text-[#525866]">
                    {n.assignedAt
                      ? new Date(n.assignedAt).toLocaleString("de-CH")
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 landing-caption text-[#525866]">
                    {n.lastReleasedAt
                      ? new Date(n.lastReleasedAt).toLocaleString("de-CH")
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => copyText(n.phoneNumber, n.phoneNumber)}
                      className="landing-radius-sm p-1.5 text-[#525866] hover:bg-[#F5F7FA]"
                      aria-label="Kopieren"
                    >
                      {copied === n.phoneNumber ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
