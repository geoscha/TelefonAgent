"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { adminPanelClass } from "@/components/admin/admin-ui";
import { landingBtnPrimary, landingInputClass } from "@/components/landing/landing-buttons";

interface AvailableNumber {
  phoneNumber: string;
  friendlyName: string;
  locality?: string;
  region?: string;
  numberType: "Mobile" | "Local";
  monthlyPriceChf?: number;
}

function formatMonthlyPrice(number: AvailableNumber): string | null {
  if (number.monthlyPriceChf == null) return null;
  return `CHF ${number.monthlyPriceChf.toFixed(2)}/Mt.`;
}

interface TwilioAccount {
  id: string;
  label: string;
  accountSidMasked: string;
  isDefault: boolean;
}

interface ElevenLabsAccount {
  id: string;
  label: string;
  apiKeyMasked: string;
  isDefault: boolean;
  fromEnv?: boolean;
}

interface TwilioAddress {
  sid: string;
  friendlyName: string;
  customerName: string;
  street: string;
  city: string;
  region: string;
  postalCode: string;
  isoCountry: string;
  validated: boolean;
}

interface TwilioBundle {
  sid: string;
  friendlyName: string;
  status: string;
  isoCountry: string;
  numberType: string;
  endUserType: string;
}

type TwilioEndUserType = "individual" | "business";

interface CountryOption {
  code: string;
  label: string;
}

const selectClass = `${landingInputClass} landing-caption min-h-9`;

function isRegulatedCountry(code: string): boolean {
  return code !== "US" && code !== "CA";
}

function normalizeBundleType(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function bundleMatchesNumberType(
  bundle: TwilioBundle,
  numberType: "Mobile" | "Local"
): boolean {
  const bundleKey = normalizeBundleType(bundle.numberType);
  if (!bundleKey || bundleKey === "unknown") return true;
  return bundleKey === normalizeBundleType(numberType);
}

function endUserTypeLabel(endUserType: TwilioEndUserType): string {
  return endUserType === "individual" ? "Privatperson" : "Unternehmen";
}

function numberTypeLabel(numberType: string): string {
  const key = normalizeBundleType(numberType);
  if (key === "mobile") return "Mobile";
  if (key === "local") return "Local";
  return numberType || "Unbekannt";
}

function formatBundleOption(bundle: TwilioBundle): string {
  return `${bundle.friendlyName} · ${numberTypeLabel(bundle.numberType)} · ${bundleStatusLabel(bundle.status)}`;
}

function bundleStatusLabel(status: string): string {
  switch (status) {
    case "twilio-approved":
      return "freigegeben";
    case "provisionally-approved":
      return "vorläufig freigegeben";
    default:
      return status;
  }
}

export function TwilioNumberOrderPanel({ onOrdered }: { onOrdered: () => void }) {
  const [contains, setContains] = useState("");
  const [country, setCountry] = useState("CH");
  const [twilioAccountId, setTwilioAccountId] = useState("");
  const [elevenLabsAccountId, setElevenLabsAccountId] = useState("");
  const [twilioAccounts, setTwilioAccounts] = useState<TwilioAccount[]>([]);
  const [elevenLabsAccounts, setElevenLabsAccounts] = useState<ElevenLabsAccount[]>([]);
  const [countries, setCountries] = useState<CountryOption[]>([
    { code: "CH", label: "Schweiz" },
  ]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [ordering, setOrdering] = useState<string | null>(null);
  const [results, setResults] = useState<AvailableNumber[]>([]);
  const [searched, setSearched] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<TwilioAddress[]>([]);
  const [addressSid, setAddressSid] = useState("");
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressCustomerName, setAddressCustomerName] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressRegion, setAddressRegion] = useState("");
  const [addressPostalCode, setAddressPostalCode] = useState("");
  const [bundles, setBundles] = useState<TwilioBundle[]>([]);
  const [endUserType, setEndUserType] = useState<TwilioEndUserType>("individual");
  const [selectedBundleSid, setSelectedBundleSid] = useState("");
  const [bundlesLoading, setBundlesLoading] = useState(false);

  const loadAddresses = useCallback(async () => {
    if (!twilioAccountId) {
      setAddresses([]);
      setAddressSid("");
      return;
    }

    setAddressesLoading(true);
    try {
      const params = new URLSearchParams({ twilioAccountId, country });
      const res = await fetch(`/api/admin/twilio-addresses?${params}`);
      const data = await res.json();
      if (res.ok && data.ok) {
        const next = (data.addresses ?? []) as TwilioAddress[];
        setAddresses(next);
        setAddressSid((current) => {
          if (next.length === 1) return next[0].sid;
          if (next.some((address) => address.sid === current)) return current;
          return next[0]?.sid ?? "";
        });
        setShowAddressForm(isRegulatedCountry(country) && next.length === 0);
      } else {
        setAddresses([]);
        setAddressSid("");
      }
    } finally {
      setAddressesLoading(false);
    }
  }, [twilioAccountId, country]);

  const loadBundles = useCallback(async () => {
    if (!twilioAccountId || !isRegulatedCountry(country)) {
      setBundles([]);
      setSelectedBundleSid("");
      return;
    }

    setBundlesLoading(true);
    try {
      const params = new URLSearchParams({
        twilioAccountId,
        country,
        endUserType,
      });
      const res = await fetch(`/api/admin/twilio-bundles?${params}`);
      const data = await res.json();
      if (res.ok && data.ok) {
        const next = (data.bundles ?? []) as TwilioBundle[];
        setBundles(next);
        setSelectedBundleSid((current) => {
          if (next.length === 1) return next[0].sid;
          if (next.some((bundle) => bundle.sid === current)) return current;
          return next[0]?.sid ?? "";
        });
      } else {
        setBundles([]);
        setSelectedBundleSid("");
      }
    } finally {
      setBundlesLoading(false);
    }
  }, [twilioAccountId, country, endUserType]);

  const loadProfiles = useCallback(async () => {
    setProfilesLoading(true);
    try {
      const res = await fetch("/api/admin/integration-profiles");
      const data = await res.json();
      if (res.ok && data.ok) {
        const twilio = (data.twilio ?? []) as TwilioAccount[];
        const elevenlabs = (data.elevenlabs ?? []) as ElevenLabsAccount[];
        setTwilioAccounts(twilio);
        setElevenLabsAccounts(elevenlabs);
        setCountries((data.countries ?? []) as CountryOption[]);

        const defaultTwilio = twilio.find((a) => a.isDefault) ?? twilio[0];
        const defaultEl =
          elevenlabs.find((a) => a.isDefault) ?? elevenlabs[0];
        if (defaultTwilio) setTwilioAccountId(defaultTwilio.id);
        if (defaultEl) setElevenLabsAccountId(defaultEl.id);
      }
    } finally {
      setProfilesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  useEffect(() => {
    void loadAddresses();
  }, [loadAddresses]);

  useEffect(() => {
    void loadBundles();
  }, [loadBundles]);

  async function createAddress(e: React.FormEvent) {
    e.preventDefault();
    if (!twilioAccountId) return;

    setSavingAddress(true);
    try {
      const res = await fetch("/api/admin/twilio-addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          twilioAccountId,
          customerName: addressCustomerName.trim(),
          street: addressStreet.trim(),
          city: addressCity.trim(),
          region: addressRegion.trim(),
          postalCode: addressPostalCode.trim(),
          isoCountry: country,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success("Adresse bei Twilio gespeichert.");
        setShowAddressForm(false);
        setAddressCustomerName("");
        setAddressStreet("");
        setAddressCity("");
        setAddressRegion("");
        setAddressPostalCode("");
        await loadAddresses();
        if (data.address?.sid) setAddressSid(data.address.sid as string);
      } else {
        toast.error(data.error ?? "Adresse konnte nicht gespeichert werden.");
      }
    } finally {
      setSavingAddress(false);
    }
  }

  async function search() {
    if (!twilioAccountId) {
      toast.error("Bitte ein Twilio-Konto auswählen.");
      return;
    }

    setSearching(true);
    setConfigError(null);
    try {
      const params = new URLSearchParams({
        country,
        limit: "15",
        twilioAccountId,
      });
      if (contains.trim()) params.set("contains", contains.trim());
      const res = await fetch(`/api/admin/twilio-numbers/search?${params}`);
      const data = await res.json();
      if (res.ok && data.ok) {
        setResults((data.numbers ?? []) as AvailableNumber[]);
        setSearched(true);
        if ((data.numbers ?? []).length === 0) {
          toast.info("Keine Nummern gefunden.");
        }
      } else {
        const msg = data.error as string;
        setConfigError(msg);
        toast.error(msg ?? "Suche fehlgeschlagen.");
      }
    } catch {
      toast.error("Verbindungsfehler.");
    } finally {
      setSearching(false);
    }
  }

  async function order(phoneNumber: string, numberType: "Mobile" | "Local") {
    if (!twilioAccountId || !elevenLabsAccountId) {
      toast.error("Bitte Twilio- und ElevenLabs-Konto auswählen.");
      return;
    }

    if (isRegulatedCountry(country) && !addressSid && addresses.length === 0) {
      toast.error("Bitte zuerst eine Geschäftsadresse für dieses Land hinterlegen.");
      setShowAddressForm(true);
      return;
    }

    const bundleSid = selectedBundleSid;
    if (isRegulatedCountry(country) && bundles.length > 0 && !bundleSid) {
      toast.error("Bitte ein Regulatory Bundle auswählen.");
      return;
    }

    const selectedBundle = bundles.find((bundle) => bundle.sid === bundleSid);
    if (
      selectedBundle &&
      !bundleMatchesNumberType(selectedBundle, numberType)
    ) {
      toast.error(
        `Das gewählte Bundle gilt für ${numberTypeLabel(selectedBundle.numberType)}-Nummern, nicht für ${numberType}.`
      );
      return;
    }

    setOrdering(phoneNumber);
    try {
      const res = await fetch("/api/admin/twilio-numbers/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber,
          twilioAccountId,
          elevenLabsAccountId,
          countryCode: country,
          addressSid: addressSid || undefined,
          bundleSid: bundleSid || undefined,
          numberType,
          endUserType,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        const assigned = data.assignedCount as number;
        toast.success(
          assigned > 0
            ? `${data.phoneNumber} gekauft · ${assigned} zugewiesen`
            : `${data.phoneNumber} im Pool`
        );
        setResults((prev) => prev.filter((n) => n.phoneNumber !== phoneNumber));
        onOrdered();
      } else {
        toast.error(data.error ?? "Kauf fehlgeschlagen.");
      }
    } catch {
      toast.error("Verbindungsfehler.");
    } finally {
      setOrdering(null);
    }
  }

  const noTwilio = !profilesLoading && twilioAccounts.length === 0;
  const noElevenLabs = !profilesLoading && elevenLabsAccounts.length === 0;

  return (
    <div id="bestellen" className={`${adminPanelClass} p-4 space-y-3`}>
      {profilesLoading ? (
        <div className="flex items-center gap-2 text-[#525866]">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="landing-caption">Konten laden…</span>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor="order-country" className="landing-caption text-[#525866]">
              Land
            </label>
            <select
              id="order-country"
              className={selectClass}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="order-twilio" className="landing-caption text-[#525866]">
              Twilio
            </label>
            <select
              id="order-twilio"
              className={selectClass}
              value={twilioAccountId}
              onChange={(e) => setTwilioAccountId(e.target.value)}
              disabled={noTwilio}
            >
              {twilioAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                  {a.isDefault ? " · Standard" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="order-el" className="landing-caption text-[#525866]">
              ElevenLabs
            </label>
            <select
              id="order-el"
              className={selectClass}
              value={elevenLabsAccountId}
              onChange={(e) => setElevenLabsAccountId(e.target.value)}
              disabled={noElevenLabs}
            >
              {elevenLabsAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                  {a.isDefault ? " · Standard" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {(noTwilio || noElevenLabs) && (
        <p className="landing-caption text-[#525866]">
          <Link href="/admin/settings" className="text-[#335cff] hover:underline">
            Konten unter Einstellungen hinterlegen
          </Link>
        </p>
      )}

      {!profilesLoading && twilioAccountId && isRegulatedCountry(country) && (
        <div className="space-y-2 border border-[#E1E4EA] landing-radius-sm p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="landing-caption text-[#525866]">
              Regulatory Adresse ({country})
            </p>
            {addressesLoading && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#525866]" />
            )}
          </div>

          {addresses.length > 0 ? (
            <select
              className={selectClass}
              value={addressSid}
              onChange={(e) => setAddressSid(e.target.value)}
            >
              {addresses.map((address) => (
                <option key={address.sid} value={address.sid}>
                  {address.friendlyName} · {address.city}
                  {address.validated ? "" : " (nicht validiert)"}
                </option>
              ))}
            </select>
          ) : (
            <p className="landing-caption text-[#99A0AE]">
              Keine Adresse für {country}. Twilio verlangt eine lokale Geschäftsadresse.
            </p>
          )}

          {!showAddressForm ? (
            <button
              type="button"
              onClick={() => setShowAddressForm(true)}
              className="landing-caption text-[#335cff] hover:underline"
            >
              {addresses.length > 0 ? "Neue Adresse hinzufügen" : "Adresse anlegen"}
            </button>
          ) : (
            <form onSubmit={createAddress} className="grid gap-2 sm:grid-cols-2">
              <input
                className={landingInputClass}
                placeholder="Firma / Name"
                value={addressCustomerName}
                onChange={(e) => setAddressCustomerName(e.target.value)}
                required
              />
              <input
                className={landingInputClass}
                placeholder="PLZ"
                value={addressPostalCode}
                onChange={(e) => setAddressPostalCode(e.target.value)}
                required
              />
              <input
                className={`${landingInputClass} sm:col-span-2`}
                placeholder="Strasse und Nr."
                value={addressStreet}
                onChange={(e) => setAddressStreet(e.target.value)}
                required
              />
              <input
                className={landingInputClass}
                placeholder="Ort"
                value={addressCity}
                onChange={(e) => setAddressCity(e.target.value)}
                required
              />
              <input
                className={landingInputClass}
                placeholder="Kanton / Region"
                value={addressRegion}
                onChange={(e) => setAddressRegion(e.target.value)}
                required
              />
              <div className="sm:col-span-2 flex gap-2">
                <button
                  type="submit"
                  disabled={savingAddress}
                  className={landingBtnPrimary}
                >
                  {savingAddress ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Bei Twilio speichern
                </button>
                {addresses.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAddressForm(false)}
                    className="landing-caption landing-radius-sm border border-[#E1E4EA] px-2.5 text-[#525866]"
                  >
                    Abbrechen
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      )}

      {!profilesLoading && twilioAccountId && isRegulatedCountry(country) && (
        <div className="space-y-2 border border-[#E1E4EA] landing-radius-sm p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="landing-caption text-[#525866]">
              Regulatory Compliance ({country})
            </p>
            {bundlesLoading && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#525866]" />
            )}
          </div>

          <div className="space-y-1">
            <label className="landing-caption text-[#99A0AE]">
              Nutzer der Nummer
            </label>
            <select
              className={selectClass}
              value={endUserType}
              onChange={(e) =>
                setEndUserType(e.target.value as TwilioEndUserType)
              }
            >
              <option value="individual">Privatperson</option>
              <option value="business">Unternehmen</option>
            </select>
          </div>

          {bundles.length > 0 ? (
            <div className="space-y-1">
              <label className="landing-caption text-[#99A0AE]">
                Regulatory Bundle
              </label>
              <select
                className={selectClass}
                value={selectedBundleSid}
                onChange={(e) => setSelectedBundleSid(e.target.value)}
              >
                {bundles.map((bundle) => (
                  <option key={bundle.sid} value={bundle.sid}>
                    {formatBundleOption(bundle)}
                  </option>
                ))}
              </select>
              <p className="landing-caption text-[#99A0AE]">
                Wählen Sie das Bundle, das zu {endUserTypeLabel(endUserType)} und
                dem Nummerntyp (Local/Mobile) passt.
              </p>
            </div>
          ) : (
            !bundlesLoading && (
              <p className="landing-caption text-[#99A0AE]">
                Kein freigegebenes Bundle für {country} ·{" "}
                {endUserTypeLabel(endUserType)}. Bitte in der Twilio Console
                unter Regulatory Compliance anlegen und freigeben lassen.
              </p>
            )
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          className={`${landingInputClass} flex-1 font-mono landing-caption`}
          placeholder="Enthält z. B. 79 oder 445"
          value={contains}
          onChange={(e) => setContains(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
          disabled={noTwilio}
        />
        <button
          type="button"
          onClick={() => void search()}
          disabled={searching || noTwilio}
          className={landingBtnPrimary}
        >
          {searching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          Suchen
        </button>
      </div>

      {configError?.includes("nicht hinterlegt") && (
        <p className="landing-caption text-[#525866]">
          <Link href="/admin/settings" className="text-[#335cff] hover:underline">
            Konten verbinden
          </Link>
        </p>
      )}

      {searched && results.length > 0 && (
        <ul className="divide-y divide-[#E1E4EA] border border-[#E1E4EA] landing-radius-sm">
          {results.map((n) => {
            const priceLabel = formatMonthlyPrice(n);
            const selectedBundle = bundles.find(
              (bundle) => bundle.sid === selectedBundleSid
            );
            const bundleMismatch =
              Boolean(selectedBundle) &&
              !bundleMatchesNumberType(selectedBundle!, n.numberType);
            const bundleMissing =
              isRegulatedCountry(country) && bundles.length > 0 && !selectedBundleSid;
            return (
            <li
              key={n.phoneNumber}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="font-mono landing-body text-[#0E121B]">
                  {n.phoneNumber}
                </p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {(n.locality || n.region) && (
                    <p className="landing-caption text-[#99A0AE]">
                      {[n.locality, n.region].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {priceLabel && (
                    <p className="landing-caption text-[#525866]">
                      {priceLabel}
                    </p>
                  )}
                  <p className="landing-caption text-[#99A0AE]">
                    {n.numberType}
                  </p>
                  {bundleMismatch && (
                    <p className="landing-caption text-amber-700">
                      Bundle passt nicht zu {n.numberType}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                disabled={
                  ordering !== null ||
                  noElevenLabs ||
                  bundleMissing ||
                  bundleMismatch ||
                  (isRegulatedCountry(country) &&
                    (addressesLoading ||
                      (!addressSid && addresses.length === 0)))
                }
                onClick={() => void order(n.phoneNumber, n.numberType)}
                className="landing-caption landing-radius-sm inline-flex min-h-8 items-center gap-1.5 border border-[#E1E4EA] px-2.5 text-[#0E121B] transition-colors hover:bg-[#F5F7FA] disabled:opacity-50"
              >
                {ordering === n.phoneNumber ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShoppingCart className="h-3.5 w-3.5" />
                )}
                Kaufen & importieren
              </button>
            </li>
            );
          })}
        </ul>
      )}

      {searched && results.length === 0 && !configError && (
        <p className="landing-caption text-[#99A0AE]">Keine Treffer.</p>
      )}
    </div>
  );
}
