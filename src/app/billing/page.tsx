"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { WelcomeBanner } from "@/components/dashboard/WelcomeBanner";
import { landingBtnPrimary } from "@/components/landing/landing-buttons";
import {
  userLabelClass,
  userPanelClass,
  userTitleClass,
} from "@/components/user/user-styles";
import {
  TOKEN_PACKS,
  tokenBalanceHighlight,
  type TokenBalanceView,
} from "@/lib/billing/quota-display";
import { cn } from "@/lib/utils";

interface Profile {
  name: string;
  tokenBalance?: TokenBalanceView;
}

export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24 text-[#525866]">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      }
    >
      <BillingPageContent />
    </Suspense>
  );
}

function BillingPageContent() {
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingPack, setLoadingPack] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("topup") === "success") {
      toast.success("Guthaben erfolgreich aufgeladen.");
    } else if (searchParams.get("topup") === "cancel") {
      toast.message("Aufladung abgebrochen.");
    }
  }, [searchParams]);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((p: Profile) => setProfile(p))
      .catch(() => toast.error("Profil konnte nicht geladen werden."));
  }, []);

  async function buyPack(packId: string) {
    setLoadingPack(packId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      toast.error(data.error ?? "Checkout konnte nicht gestartet werden.");
    } catch {
      toast.error("Checkout konnte nicht gestartet werden.");
    } finally {
      setLoadingPack(null);
    }
  }

  const firstName = profile?.name.trim().split(/\s+/)[0] || "…";
  const balanceHighlight = profile?.tokenBalance
    ? tokenBalanceHighlight(profile.tokenBalance)
    : { value: "—", suffix: "Tokens" };

  return (
    <div className="mx-auto max-w-[900px] space-y-8 pb-4">
        <WelcomeBanner
          name={firstName}
          highlight={balanceHighlight.value}
          highlightSuffix={balanceHighlight.suffix}
        />

        <div>
          <p className={userTitleClass}>Guthaben aufladen</p>
          <p className={`${userLabelClass} mt-1`}>
            Wählen Sie ein Paket, um Tokens für Telefonate und Nummern zu kaufen.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {TOKEN_PACKS.map((pack) => (
            <div key={pack.id} className={cn(userPanelClass, "flex flex-col p-6")}>
              <p className={userTitleClass}>{pack.label}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-[28px] font-normal leading-none text-[#0E121B]">
                  CHF {pack.priceChf}
                </span>
              </div>
              <div className="mt-auto pt-6">
                <button
                  type="button"
                  onClick={() => buyPack(pack.id)}
                  disabled={loadingPack === pack.id}
                  className={cn(landingBtnPrimary, "w-full justify-center")}
                >
                  {loadingPack === pack.id && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  Jetzt kaufen
                </button>
              </div>
            </div>
          ))}
        </div>

        {profile?.tokenBalance?.phonePaused && (
          <div className={cn(userPanelClass, "border-amber-200 bg-amber-50/50 p-5")}>
            <p className={userTitleClass}>Telefonnummer pausiert</p>
            <p className={`${userLabelClass} mt-2`}>
              Ihr Guthaben ist aufgebraucht. Laden Sie Tokens auf, um Ihre Nummer
              wieder zu aktivieren. Wird innerhalb von 7 Tagen kein Guthaben
              aufgeladen, wird die Nummer freigegeben — Ihre Agenten bleiben
              erhalten.
            </p>
          </div>
        )}
    </div>
  );
}
