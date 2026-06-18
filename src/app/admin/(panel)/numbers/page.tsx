"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface AdminPoolNumber {
  phoneNumber: string;
  elevenLabsPhoneNumberId: string;
  status: "frei" | "belegt";
  assignedUserName?: string;
  assignedUserEmail?: string;
  assignedAt?: string;
  inDatabase: boolean;
}

export default function AdminNumbersPage() {
  const [numbers, setNumbers] = useState<AdminPoolNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "frei" | "belegt">("all");
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
    toast.success("In Zwischenablage kopiert");
    setTimeout(() => setCopied(null), 2000);
  }

  async function copyAllFree() {
    const free = numbers
      .filter((n) => n.status === "frei")
      .map((n) => n.phoneNumber)
      .join("\n");
    if (!free) {
      toast.info("Keine freien Nummern vorhanden.");
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
      toast.error("Bitte Nummer(n) eingeben.");
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
              ? `${added} Nummer(n) hinzugefügt · ${assigned} zugewiesen`
              : `${added} Nummer(n) hinzugefügt`
          );
          setNewNumbers("");
          await load();
        }
        if (skipped.length > 0) {
          const labels: Record<string, string> = {
            duplicate_input: "doppelt eingegeben",
            already_free: "bereits frei im Pool",
            already_used: "bereits belegt",
          };
          toast.warning(
            `${skipped.length} übersprungen: ${skipped
              .map((s) => `${s.phone} (${labels[s.reason] ?? s.reason})`)
              .join(", ")}`
          );
        }
      } else {
        toast.error(data.error ?? "Hinzufügen fehlgeschlagen.");
        if (data.skipped?.length) {
          const skipped = data.skipped as { phone: string; reason: string }[];
          toast.warning(
            skipped.map((s) => s.phone).join(", ")
          );
        }
      }
    } finally {
      setAdding(false);
    }
  }

  const filtered = numbers.filter((n) => filter === "all" || n.status === filter);
  const freeCount = numbers.filter((n) => n.status === "frei").length;
  const usedCount = numbers.filter((n) => n.status === "belegt").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1>Nummern</h1>
        <Button variant="outline" size="sm" onClick={copyAllFree}>
          <Copy className="mr-2 h-4 w-4" />
          Alle freien kopieren
        </Button>
      </div>

      <div className="rounded-card border border-stroke bg-surface p-5 space-y-3">
        <Label htmlFor="new-numbers">Neue Nummern</Label>
        <textarea
          id="new-numbers"
          className="flex min-h-[72px] w-full rounded-btn border border-stroke bg-bg px-3 py-2 font-mono text-caption"
          placeholder="+41445054632&#10;+41445054633"
          value={newNumbers}
          onChange={(e) => setNewNumbers(e.target.value)}
        />
        <Button size="sm" onClick={addNumbers} disabled={adding}>
          {adding ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          Hinzufügen
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Stat label="Gesamt" value={numbers.length} />
        <Stat label="Frei" value={freeCount} accent />
        <Stat label="Belegt" value={usedCount} />
      </div>

      <div className="flex gap-2">
        {(["all", "frei", "belegt"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-caption font-medium transition-colors ${
              filter === f
                ? "bg-accent text-white"
                : "border border-stroke bg-bg text-text-muted hover:text-navy"
            }`}
          >
            {f === "all" ? "Alle" : f === "frei" ? "Frei" : "Belegt"}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-card border border-stroke bg-surface">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-text-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
            Laden…
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-body text-text-muted">
            Keine Nummern gefunden.
          </p>
        ) : (
          <table className="w-full text-left text-body">
            <thead>
              <tr className="border-b border-stroke bg-bg/50 text-caption text-text-muted">
                <th className="px-4 py-3 font-medium">Nummer</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Zugewiesen</th>
                <th className="px-4 py-3 font-medium">Kopieren</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke">
              {filtered.map((n) => (
                <tr key={n.phoneNumber} className="hover:bg-bg/30">
                  <td className="px-4 py-3 font-mono text-navy">
                    {n.phoneNumber}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={n.status === "frei" ? "success" : "default"}>
                      {n.status === "frei" ? "Frei" : "Belegt"}
                    </Badge>
                    {!n.inDatabase && (
                      <p className="mt-1 text-caption text-text-muted">
                        Nur in Env
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {n.status === "belegt" ? (
                      <>
                        <p className="font-medium text-navy">
                          {n.assignedUserName || "—"}
                        </p>
                        <p className="text-caption text-text-muted">
                          {n.assignedUserEmail}
                        </p>
                      </>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-caption text-text-muted">
                    {n.assignedAt
                      ? new Date(n.assignedAt).toLocaleString("de-CH")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyText(n.phoneNumber, n.phoneNumber)}
                    >
                      {copied === n.phoneNumber ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
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

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-card border px-4 py-3 ${
        accent ? "border-accent/30 bg-accent/5" : "border-stroke bg-surface"
      }`}
    >
      <p className="text-caption text-text-muted">{label}</p>
      <p className="text-h3 text-navy">{value}</p>
    </div>
  );
}
