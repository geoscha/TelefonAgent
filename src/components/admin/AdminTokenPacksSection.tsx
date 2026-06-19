"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { adminPanelClass } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { landingInputClass } from "@/components/landing/landing-buttons";
import {
  STRIPE_MIN_PRICE_CHF,
  formatTokenPackLabel,
  isValidStripeCheckoutPrice,
  type TokenPackConfig,
} from "@/lib/billing/token-pack-types";
import { cn } from "@/lib/utils";

function newPackDraft(sortOrder: number): TokenPackConfig {
  return {
    id: `pack_${Date.now()}_${sortOrder}`,
    tokens: 5_000,
    priceChf: STRIPE_MIN_PRICE_CHF,
    label: formatTokenPackLabel(5_000),
    enabled: true,
    sortOrder,
  };
}

export function AdminTokenPacksSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [packs, setPacks] = useState<TokenPackConfig[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/token-packs");
      const data = await res.json();
      if (res.ok && data.ok) {
        setPacks(data.packs as TokenPackConfig[]);
      } else {
        toast.error("Token-Pakete konnten nicht geladen werden.");
      }
    } catch {
      toast.error("Netzwerkfehler beim Laden der Token-Pakete.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function updatePack(index: number, patch: Partial<TokenPackConfig>) {
    setPacks((current) =>
      current.map((pack, i) => (i === index ? { ...pack, ...patch } : pack))
    );
  }

  function removePack(index: number) {
    setPacks((current) => current.filter((_, i) => i !== index));
  }

  function addPack() {
    setPacks((current) => [...current, newPackDraft(current.length)]);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();

    const invalid = packs.find((pack) => !isValidStripeCheckoutPrice(pack.priceChf));
    if (invalid) {
      toast.error(
        `„${invalid.label}“: Mindestpreis ist CHF ${STRIPE_MIN_PRICE_CHF.toFixed(2)} (Stripe-Limit).`
      );
      return;
    }

    setSaving(true);
    try {
      const payload = packs.map((pack, index) => ({
        ...pack,
        sortOrder: index,
        label:
          pack.label.trim() ||
          formatTokenPackLabel(pack.tokens),
      }));

      const res = await fetch("/api/admin/token-packs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packs: payload }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Speichern fehlgeschlagen.");
        return;
      }

      setPacks(data.packs as TokenPackConfig[]);
      toast.success("Token-Pakete gespeichert — Stripe nutzt die neuen Preise sofort.");
    } catch {
      toast.error("Netzwerkfehler beim Speichern.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className={`${adminPanelClass} flex items-center gap-2 p-4 text-[#525866]`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="landing-caption">Token-Pakete laden…</span>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void save(event)} className={`${adminPanelClass} space-y-4 p-4`}>
      <div>
        <h2 className="landing-body font-medium text-[#0E121B]">Token-Pakete</h2>
        <p className="landing-caption mt-1 text-[#99A0AE]">
          Preise und Mengen für die Abrechnungsseite. Änderungen gelten sofort
          für neue Stripe-Checkouts (Mindestpreis CHF {STRIPE_MIN_PRICE_CHF.toFixed(2)}).
        </p>
      </div>

      <div className="space-y-3">
        {packs.map((pack, index) => (
          <div
            key={pack.id}
            className="space-y-3 rounded border border-[#E1E4EA] bg-[#FAFAFA] p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="landing-caption font-mono text-[#525866]">{pack.id}</p>
              <div className="flex items-center gap-2">
                <Label className="landing-caption flex items-center gap-2 text-[#525866]">
                  Aktiv
                  <Switch
                    checked={pack.enabled}
                    onCheckedChange={(checked) =>
                      updatePack(index, { enabled: checked })
                    }
                    aria-label="Paket aktiv"
                  />
                </Label>
                <button
                  type="button"
                  onClick={() => removePack(index)}
                  className="rounded p-1.5 text-[#525866] hover:bg-white hover:text-red-600"
                  title="Paket entfernen"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="landing-caption">Tokens</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  className={cn(landingInputClass, "font-mono")}
                  value={pack.tokens}
                  onChange={(event) => {
                    const tokens = Number(event.target.value);
                    updatePack(index, {
                      tokens,
                      label: formatTokenPackLabel(tokens),
                    });
                  }}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="landing-caption">Preis (CHF)</Label>
                <Input
                  type="number"
                  min={STRIPE_MIN_PRICE_CHF}
                  step={0.01}
                  className={cn(landingInputClass, "font-mono")}
                  value={pack.priceChf}
                  onChange={(event) =>
                    updatePack(index, { priceChf: Number(event.target.value) })
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="landing-caption">Anzeigename</Label>
                <Input
                  className={landingInputClass}
                  value={pack.label}
                  onChange={(event) =>
                    updatePack(index, { label: event.target.value })
                  }
                  required
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={addPack}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Paket hinzufügen
        </Button>
        <Button type="submit" size="sm" disabled={saving || packs.length === 0}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Speichern"}
        </Button>
      </div>
    </form>
  );
}
