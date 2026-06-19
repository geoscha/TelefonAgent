import "server-only";

import type { TwilioCredentials } from "@/lib/admin/integration-profiles";
import { getTwilioCredentials } from "@/lib/admin/integration-profiles";
import { usdToChf } from "@/lib/admin/finance-integrations";
import { getUsdToChfRate } from "@/lib/admin/usd-chf-rate";

export interface TwilioAvailableNumber {
  phoneNumber: string;
  friendlyName: string;
  locality?: string;
  region?: string;
  numberType: "Mobile" | "Local";
  /** Monthly Twilio cost converted to CHF for display. */
  monthlyPriceChf?: number;
}

export interface TwilioPurchasedNumber {
  sid: string;
  phoneNumber: string;
  friendlyName: string;
}

export interface TwilioAddress {
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

export interface TwilioBundle {
  sid: string;
  friendlyName: string;
  status: string;
  isoCountry: string;
  numberType: string;
  endUserType: string;
}

export type TwilioEndUserType = "individual" | "business";

export interface CreateTwilioAddressInput {
  customerName: string;
  street: string;
  city: string;
  region: string;
  postalCode: string;
  isoCountry: string;
  friendlyName?: string;
}

export const TWILIO_COUNTRY_OPTIONS = [
  { code: "CH", label: "Schweiz" },
  { code: "DE", label: "Deutschland" },
  { code: "AT", label: "Österreich" },
  { code: "US", label: "USA" },
  { code: "GB", label: "Grossbritannien" },
  { code: "FR", label: "Frankreich" },
  { code: "IT", label: "Italien" },
  { code: "NL", label: "Niederlande" },
  { code: "BE", label: "Belgien" },
  { code: "ES", label: "Spanien" },
  { code: "SE", label: "Schweden" },
  { code: "NO", label: "Norwegen" },
  { code: "DK", label: "Dänemark" },
  { code: "PL", label: "Polen" },
  { code: "IE", label: "Irland" },
] as const;

const TWILIO_BASE = "https://api.twilio.com/2010-04-01";
const TWILIO_PRICING_BASE = "https://pricing.twilio.com/v1";
const TWILIO_NUMBERS_BASE = "https://numbers.twilio.com/v2";

const APPROVED_BUNDLE_STATUSES = new Set([
  "twilio-approved",
  "provisionally-approved",
]);

function twilioAuth(credentials: TwilioCredentials): string {
  return Buffer.from(
    `${credentials.accountSid}:${credentials.authToken}`
  ).toString("base64");
}

async function twilioGet(
  credentials: TwilioCredentials,
  path: string
): Promise<Response> {
  return fetch(`${TWILIO_BASE}/Accounts/${credentials.accountSid}${path}`, {
    headers: { Authorization: `Basic ${twilioAuth(credentials)}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
}

async function twilioNumbersGet(
  credentials: TwilioCredentials,
  path: string
): Promise<Response> {
  return fetch(`${TWILIO_NUMBERS_BASE}${path}`, {
    headers: { Authorization: `Basic ${twilioAuth(credentials)}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
}

async function twilioPost(
  credentials: TwilioCredentials,
  path: string,
  body: Record<string, string>
): Promise<Response> {
  return fetch(`${TWILIO_BASE}/Accounts/${credentials.accountSid}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${twilioAuth(credentials)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
}

export async function requireTwilioConfig(
  accountId?: string
): Promise<TwilioCredentials> {
  return getTwilioCredentials(accountId);
}

type TwilioNumberPriceMap = Map<
  string,
  { monthly: number; currency: string }
>;

function pricingKeyForNumberType(numberType: "Mobile" | "Local"): string {
  return numberType === "Mobile" ? "mobile" : "local";
}

const EURO_COUNTRIES = new Set([
  "AT",
  "BE",
  "DE",
  "ES",
  "FR",
  "IE",
  "IT",
  "NL",
]);

const EUR_TO_CHF_FALLBACK = 0.94;
const GBP_TO_CHF_FALLBACK = 1.12;

function roundChf(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Fallback when Twilio omits price_unit (CH is CHF, not USD). */
function inferPriceCurrency(countryCode: string, priceUnit?: string | null): string {
  const fromApi = priceUnit?.trim();
  if (fromApi) return fromApi.toUpperCase();

  const cc = countryCode.toUpperCase();
  if (cc === "CH" || cc === "LI") return "CHF";
  if (cc === "GB") return "GBP";
  if (EURO_COUNTRIES.has(cc)) return "EUR";
  return "USD";
}

function toChfAmount(
  amount: number,
  currency: string,
  usdChfRate: number
): number {
  const normalized = currency.toLowerCase();
  if (normalized === "chf") return roundChf(amount);
  if (normalized === "usd") return roundChf(usdToChf(amount, usdChfRate));
  if (normalized === "eur") return roundChf(amount * EUR_TO_CHF_FALLBACK);
  if (normalized === "gbp") return roundChf(amount * GBP_TO_CHF_FALLBACK);
  return roundChf(amount);
}

async function fetchTwilioPhoneNumberPricing(
  credentials: TwilioCredentials,
  countryCode: string
): Promise<TwilioNumberPriceMap> {
  const res = await fetch(
    `${TWILIO_PRICING_BASE}/PhoneNumbers/Countries/${countryCode}`,
    {
      headers: { Authorization: `Basic ${twilioAuth(credentials)}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!res.ok) return new Map();

  const data = (await res.json()) as {
    phone_number_prices?: {
      number_type?: string;
      current_price?: number | string;
      base_price?: number | string;
    }[];
    price_unit?: string;
  };

  const defaultCurrency = inferPriceCurrency(countryCode, data.price_unit);
  const prices: TwilioNumberPriceMap = new Map();

  for (const entry of data.phone_number_prices ?? []) {
    const type = entry.number_type?.trim().toLowerCase();
    if (!type) continue;

    const monthly = Number(entry.current_price ?? entry.base_price);
    if (!Number.isFinite(monthly) || monthly < 0) continue;

    prices.set(type, { monthly, currency: defaultCurrency });
  }

  return prices;
}

function attachPricingToNumbers(
  numbers: TwilioAvailableNumber[],
  prices: TwilioNumberPriceMap,
  usdChfRate: number
): TwilioAvailableNumber[] {
  return numbers.map((number) => {
    const price = prices.get(pricingKeyForNumberType(number.numberType));
    if (!price) return number;

    const monthlyPriceChf = toChfAmount(
      price.monthly,
      price.currency,
      usdChfRate
    );

    return {
      ...number,
      monthlyPriceChf,
    };
  });
}

async function searchNumberType(
  credentials: TwilioCredentials,
  countryCode: string,
  numberType: "Mobile" | "Local",
  contains?: string,
  limit = 20
): Promise<TwilioAvailableNumber[]> {
  const params = new URLSearchParams({
    PageSize: String(Math.min(limit, 30)),
    VoiceEnabled: "true",
  });
  if (contains?.trim()) {
    params.set("Contains", contains.trim().replace(/\s+/g, ""));
  }

  const res = await twilioGet(
    credentials,
    `/AvailablePhoneNumbers/${countryCode}/${numberType}.json?${params}`
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(
      err.slice(0, 160) || `Twilio-Suche fehlgeschlagen (${res.status}).`
    );
  }

  const data = (await res.json()) as {
    available_phone_numbers?: {
      phone_number?: string;
      friendly_name?: string;
      locality?: string;
      region?: string;
    }[];
  };

  return (data.available_phone_numbers ?? [])
    .filter((n) => n.phone_number)
    .map((n) => ({
      phoneNumber: n.phone_number!,
      friendlyName: n.friendly_name ?? n.phone_number!,
      locality: n.locality,
      region: n.region,
      numberType,
    }));
}

export async function searchTwilioAvailableNumbers(options: {
  countryCode?: string;
  contains?: string;
  limit?: number;
  twilioAccountId?: string;
}): Promise<TwilioAvailableNumber[]> {
  const credentials = await requireTwilioConfig(options.twilioAccountId);
  const country = (options.countryCode ?? "CH").toUpperCase();
  const limit = options.limit ?? 20;

  const [mobile, pricing, { rate: usdChfRate }] = await Promise.all([
    searchNumberType(credentials, country, "Mobile", options.contains, limit),
    fetchTwilioPhoneNumberPricing(credentials, country),
    getUsdToChfRate(),
  ]);

  let numbers = mobile;
  if (mobile.length < limit) {
    const local = await searchNumberType(
      credentials,
      country,
      "Local",
      options.contains,
      limit - mobile.length
    );
    numbers = [...mobile, ...local];
  }

  const seen = new Set<string>();
  const unique = numbers.filter((n) => {
    if (seen.has(n.phoneNumber)) return false;
    seen.add(n.phoneNumber);
    return true;
  });

  return attachPricingToNumbers(unique.slice(0, limit), pricing, usdChfRate);
}

export async function listTwilioAddresses(
  twilioAccountId?: string
): Promise<TwilioAddress[]> {
  const credentials = await requireTwilioConfig(twilioAccountId);
  const res = await twilioGet(credentials, "/Addresses.json?PageSize=50");

  if (!res.ok) {
    const err = await res.text();
    throw new Error(
      err.slice(0, 160) || `Twilio-Adressen konnten nicht geladen werden (${res.status}).`
    );
  }

  const data = (await res.json()) as {
    addresses?: {
      sid?: string;
      friendly_name?: string;
      customer_name?: string;
      street?: string;
      city?: string;
      region?: string;
      postal_code?: string;
      iso_country?: string;
      validated?: boolean;
    }[];
  };

  return (data.addresses ?? [])
    .filter((row) => row.sid)
    .map((row) => ({
      sid: row.sid!,
      friendlyName: row.friendly_name?.trim() || row.customer_name?.trim() || row.sid!,
      customerName: row.customer_name?.trim() ?? "",
      street: row.street?.trim() ?? "",
      city: row.city?.trim() ?? "",
      region: row.region?.trim() ?? "",
      postalCode: row.postal_code?.trim() ?? "",
      isoCountry: (row.iso_country ?? "").toUpperCase(),
      validated: Boolean(row.validated),
    }));
}

export async function createTwilioAddress(
  input: CreateTwilioAddressInput,
  twilioAccountId?: string
): Promise<TwilioAddress> {
  const credentials = await requireTwilioConfig(twilioAccountId);
  const isoCountry = input.isoCountry.trim().toUpperCase();

  const res = await twilioPost(credentials, "/Addresses.json", {
    CustomerName: input.customerName.trim(),
    Street: input.street.trim(),
    City: input.city.trim(),
    Region: input.region.trim(),
    PostalCode: input.postalCode.trim(),
    IsoCountry: isoCountry,
    FriendlyName: input.friendlyName?.trim() || input.customerName.trim(),
    AutoCorrectAddress: "true",
  });

  const data = (await res.json().catch(() => null)) as {
    sid?: string;
    friendly_name?: string;
    customer_name?: string;
    street?: string;
    city?: string;
    region?: string;
    postal_code?: string;
    iso_country?: string;
    validated?: boolean;
    message?: string;
  } | null;

  if (!res.ok || !data?.sid) {
    throw new Error(
      data?.message?.trim() ||
        `Twilio-Adresse konnte nicht erstellt werden (${res.status}).`
    );
  }

  return {
    sid: data.sid,
    friendlyName: data.friendly_name?.trim() || input.customerName.trim(),
    customerName: data.customer_name?.trim() ?? input.customerName.trim(),
    street: data.street?.trim() ?? input.street.trim(),
    city: data.city?.trim() ?? input.city.trim(),
    region: data.region?.trim() ?? input.region.trim(),
    postalCode: data.postal_code?.trim() ?? input.postalCode.trim(),
    isoCountry: (data.iso_country ?? isoCountry).toUpperCase(),
    validated: Boolean(data.validated),
  };
}

export async function resolveAddressSidForCountry(
  credentials: TwilioCredentials,
  countryCode: string,
  preferredSid?: string
): Promise<string> {
  const sid = await resolveAddressSidForPurchase(
    credentials,
    countryCode,
    preferredSid
  );
  if (!sid) {
    throw new Error(
      `Für ${countryCode.toUpperCase()} braucht Twilio eine hinterlegte Geschäftsadresse. Bitte unten eine Adresse anlegen.`
    );
  }
  return sid;
}

async function resolveAddressSidForPurchase(
  credentials: TwilioCredentials,
  countryCode: string,
  preferredSid?: string
): Promise<string | undefined> {
  const country = countryCode.toUpperCase();
  const regulated = country !== "US" && country !== "CA";
  const addresses = await listTwilioAddressesFromCredentials(credentials);

  if (preferredSid) {
    const picked = addresses.find((address) => address.sid === preferredSid);
    if (!picked) {
      throw new Error("Die gewählte Twilio-Adresse wurde nicht gefunden.");
    }
    return picked.sid;
  }

  const localMatches = addresses.filter(
    (address) => address.isoCountry === country
  );
  if (localMatches.length === 1) {
    return localMatches[0].sid;
  }
  if (localMatches.length > 1) {
    const validated =
      localMatches.find((address) => address.validated) ?? localMatches[0];
    return validated.sid;
  }

  if (!regulated) {
    return undefined;
  }

  if (addresses.length === 1) {
    return addresses[0].sid;
  }

  throw new Error(
    `Für ${country} braucht Twilio eine hinterlegte Geschäftsadresse in diesem Land. Bitte unten eine Adresse anlegen oder in der Twilio Console unter Regulatory Compliance hinzufügen.`
  );
}

function normalizeBundleNumberType(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function matchesBundleNumberType(
  bundleType: string,
  numberType: "Mobile" | "Local"
): boolean {
  const bundleKey = normalizeBundleNumberType(bundleType);
  if (!bundleKey || bundleKey === "unknown") return true;
  const wanted = normalizeBundleNumberType(numberType);
  return bundleKey === wanted;
}

function matchesEndUserType(
  bundle: TwilioBundle,
  endUserType?: TwilioEndUserType
): boolean {
  if (!endUserType) return true;
  const bundleEndUser = bundle.endUserType.trim().toLowerCase();
  if (!bundleEndUser || bundleEndUser === "unknown") return true;
  return bundleEndUser === endUserType;
}

export function endUserTypeLabel(endUserType: string): string {
  switch (endUserType.trim().toLowerCase()) {
    case "individual":
      return "Privatperson";
    case "business":
      return "Unternehmen";
    default:
      return endUserType || "Unbekannt";
  }
}

function numberTypeLabel(numberType: string): string {
  const key = normalizeBundleNumberType(numberType);
  if (key === "mobile") return "Mobile";
  if (key === "local") return "Local";
  if (key === "national") return "National";
  if (key === "tollfree") return "Toll-free";
  return numberType || "Unbekannt";
}

function bundleStatusLabel(status: string): string {
  switch (status) {
    case "twilio-approved":
      return "freigegeben";
    case "provisionally-approved":
      return "vorläufig freigegeben";
    case "pending-review":
      return "in Prüfung";
    case "in-review":
      return "wird geprüft";
    case "twilio-rejected":
      return "abgelehnt";
    default:
      return status;
  }
}

async function listTwilioBundlesFromCredentials(
  credentials: TwilioCredentials,
  options?: {
    countryCode?: string;
    numberType?: string;
    endUserType?: TwilioEndUserType;
  }
): Promise<TwilioBundle[]> {
  const params = new URLSearchParams({ PageSize: "50" });
  if (options?.countryCode) {
    params.set("IsoCountry", options.countryCode.toUpperCase());
  }
  if (options?.numberType) {
    params.set("NumberType", options.numberType.toLowerCase());
  }
  if (options?.endUserType) {
    params.set("EndUserType", options.endUserType);
  }

  const res = await twilioNumbersGet(
    credentials,
    `/RegulatoryCompliance/Bundles?${params}`
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(
      err.slice(0, 160) ||
        `Twilio-Bundles konnten nicht geladen werden (${res.status}).`
    );
  }

  const data = (await res.json()) as {
    results?: {
      sid?: string;
      friendly_name?: string;
      status?: string;
      iso_country?: string;
      number_type?: string;
      end_user_type?: string;
    }[];
  };

  return (data.results ?? [])
    .filter((row) => row.sid)
    .map((row) => ({
      sid: row.sid!,
      friendlyName: row.friendly_name?.trim() || row.sid!,
      status: (row.status ?? "unknown").toLowerCase(),
      isoCountry: (row.iso_country ?? "").toUpperCase(),
      numberType: row.number_type?.trim() || "unknown",
      endUserType: row.end_user_type?.trim().toLowerCase() || "unknown",
    }));
}

export async function listTwilioBundles(
  twilioAccountId?: string,
  options?: {
    countryCode?: string;
    endUserType?: TwilioEndUserType;
    includePending?: boolean;
  }
): Promise<TwilioBundle[]> {
  const credentials = await requireTwilioConfig(twilioAccountId);
  const bundles = await listTwilioBundlesFromCredentials(credentials, {
    countryCode: options?.countryCode,
  });

  const filtered = bundles.filter((bundle) =>
    matchesEndUserType(bundle, options?.endUserType)
  );

  if (options?.includePending) {
    return filtered;
  }

  return filtered.filter((bundle) => APPROVED_BUNDLE_STATUSES.has(bundle.status));
}

async function resolveBundleSidForPurchase(
  credentials: TwilioCredentials,
  countryCode: string,
  numberType: "Mobile" | "Local",
  preferredSid?: string,
  endUserType?: TwilioEndUserType
): Promise<string | undefined> {
  const country = countryCode.toUpperCase();
  if (country === "US" || country === "CA") return undefined;

  const allBundles = await listTwilioBundlesFromCredentials(credentials, {
    countryCode: country,
    endUserType,
  });
  const approved = allBundles.filter((bundle) =>
    APPROVED_BUNDLE_STATUSES.has(bundle.status)
  );

  if (preferredSid) {
    const picked = allBundles.find((bundle) => bundle.sid === preferredSid);
    if (!picked) {
      throw new Error("Das gewählte Regulatory Bundle wurde nicht gefunden.");
    }
    if (!APPROVED_BUNDLE_STATUSES.has(picked.status)) {
      throw new Error(
        `Bundle «${picked.friendlyName}» ist noch nicht freigegeben (Status: ${bundleStatusLabel(picked.status)}).`
      );
    }
    return picked.sid;
  }

  const matching = approved.filter(
    (bundle) =>
      matchesEndUserType(bundle, endUserType) &&
      matchesBundleNumberType(bundle.numberType, numberType)
  );

  if (matching.length === 1) {
    return matching[0].sid;
  }

  if (matching.length > 1) {
    throw new Error(
      `Mehrere gültige Regulatory Bundles für ${country} · ${numberType}. Bitte eines auswählen.`
    );
  }

  const sameEndUser = approved.filter((bundle) =>
    matchesEndUserType(bundle, endUserType)
  );
  if (sameEndUser.length > 0) {
    throw new Error(
      `Kein freigegebenes Bundle für ${country} · ${numberType} · ${endUserTypeLabel(endUserType ?? "unknown")}. Vorhandene Bundles gelten für: ${Array.from(new Set(sameEndUser.map((b) => numberTypeLabel(b.numberType)))).join(", ")}. Bitte passendes Bundle auswählen oder Nummerntyp anpassen.`
    );
  }

  throw new Error(
    `Kein freigegebenes Regulatory Bundle für ${country} · ${endUserTypeLabel(endUserType ?? "unknown")}. Bitte in der Twilio Console unter Regulatory Compliance anlegen oder unten auswählen.`
  );
}

export function formatTwilioBundleLabel(bundle: TwilioBundle): string {
  return `${bundle.friendlyName} · ${numberTypeLabel(bundle.numberType)} · ${endUserTypeLabel(bundle.endUserType)} · ${bundleStatusLabel(bundle.status)}`;
}

async function listTwilioAddressesFromCredentials(
  credentials: TwilioCredentials
): Promise<TwilioAddress[]> {
  const res = await twilioGet(credentials, "/Addresses.json?PageSize=50");
  if (!res.ok) return [];

  const data = (await res.json()) as {
    addresses?: {
      sid?: string;
      friendly_name?: string;
      customer_name?: string;
      street?: string;
      city?: string;
      region?: string;
      postal_code?: string;
      iso_country?: string;
      validated?: boolean;
    }[];
  };

  return (data.addresses ?? [])
    .filter((row) => row.sid)
    .map((row) => ({
      sid: row.sid!,
      friendlyName: row.friendly_name?.trim() || row.customer_name?.trim() || row.sid!,
      customerName: row.customer_name?.trim() ?? "",
      street: row.street?.trim() ?? "",
      city: row.city?.trim() ?? "",
      region: row.region?.trim() ?? "",
      postalCode: row.postal_code?.trim() ?? "",
      isoCountry: (row.iso_country ?? "").toUpperCase(),
      validated: Boolean(row.validated),
    }));
}

export async function purchaseTwilioPhoneNumber(
  phoneNumber: string,
  options?: {
    twilioAccountId?: string;
    countryCode?: string;
    addressSid?: string;
    bundleSid?: string;
    numberType?: "Mobile" | "Local";
    endUserType?: TwilioEndUserType;
  }
): Promise<TwilioPurchasedNumber> {
  const credentials = await requireTwilioConfig(options?.twilioAccountId);
  const countryCode = (options?.countryCode ?? inferCountryFromPhone(phoneNumber)).toUpperCase();

  const body: Record<string, string> = {
    PhoneNumber: phoneNumber,
    FriendlyName: `Cura ${phoneNumber}`,
  };

  const addressSid = await resolveAddressSidForPurchase(
    credentials,
    countryCode,
    options?.addressSid
  );
  if (addressSid) {
    body.AddressSid = addressSid;
  }

  if (options?.numberType) {
    const bundleSid = await resolveBundleSidForPurchase(
      credentials,
      countryCode,
      options.numberType,
      options.bundleSid,
      options.endUserType
    );
    if (bundleSid) {
      body.BundleSid = bundleSid;
    }
  }

  const res = await twilioPost(credentials, "/IncomingPhoneNumbers.json", body);

  const data = (await res.json().catch(() => null)) as {
    sid?: string;
    phone_number?: string;
    friendly_name?: string;
    message?: string;
    code?: number;
  } | null;

  if (!res.ok || !data?.sid || !data.phone_number) {
    const message =
      data?.message?.trim() ||
      `Twilio-Kauf fehlgeschlagen (${res.status}).`;
    if (message.toLowerCase().includes("addresssid")) {
      throw new Error(
        `${message} Bitte eine Geschäftsadresse für ${countryCode} im Admin-Bereich hinterlegen.`
      );
    }
    if (message.toLowerCase().includes("bundle")) {
      throw new Error(
        `${message} Bitte ein freigegebenes Regulatory Bundle für ${countryCode} auswählen.`
      );
    }
    throw new Error(message);
  }

  return {
    sid: data.sid,
    phoneNumber: data.phone_number,
    friendlyName: data.friendly_name ?? data.phone_number,
  };
}

function inferCountryFromPhone(phoneNumber: string): string {
  const normalized = phoneNumber.replace(/\s+/g, "");
  if (normalized.startsWith("+41")) return "CH";
  if (normalized.startsWith("+49")) return "DE";
  if (normalized.startsWith("+43")) return "AT";
  if (normalized.startsWith("+44")) return "GB";
  if (normalized.startsWith("+33")) return "FR";
  if (normalized.startsWith("+39")) return "IT";
  if (normalized.startsWith("+31")) return "NL";
  if (normalized.startsWith("+32")) return "BE";
  if (normalized.startsWith("+34")) return "ES";
  if (normalized.startsWith("+46")) return "SE";
  if (normalized.startsWith("+47")) return "NO";
  if (normalized.startsWith("+45")) return "DK";
  if (normalized.startsWith("+48")) return "PL";
  if (normalized.startsWith("+353")) return "IE";
  if (normalized.startsWith("+1")) return "US";
  return "CH";
}
