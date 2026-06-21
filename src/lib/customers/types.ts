/** ERP / Excel sources that supply tenant/customer master data. */
export const CUSTOMER_DATA_PROVIDERS = [
  "immotop2",
  "rimo_r5",
  "garaio_rem",
  "fairwalter",
  "excel",
  "upload",
  "gsheet",
] as const;

export type CustomerDataProviderId = (typeof CUSTOMER_DATA_PROVIDERS)[number];

/** Sources backed by a parsed spreadsheet (header row + rows), not a live ERP. */
export const SPREADSHEET_PROVIDERS = ["excel", "upload", "gsheet"] as const;
export type SpreadsheetProviderId = (typeof SPREADSHEET_PROVIDERS)[number];

export function isCustomerDataProvider(
  provider: string
): provider is CustomerDataProviderId {
  return (CUSTOMER_DATA_PROVIDERS as readonly string[]).includes(provider);
}

export function isSpreadsheetProvider(
  provider: string
): provider is SpreadsheetProviderId {
  return (SPREADSHEET_PROVIDERS as readonly string[]).includes(provider);
}

export type CustomerRecordType = "customer" | "craftsman";

export interface CustomerRecord {
  id: string;
  provider: CustomerDataProviderId;
  /** Mieter/Kunde vs Handwerker — defaults to customer when omitted. */
  recordType?: CustomerRecordType;
  name: string;
  phone?: string;
  /** Strict E.164 (+41…) for matching; undefined when not normalizable. */
  phoneNormalized?: string;
  /** Phone present in source but could not be normalized to E.164. */
  phoneUnmatched?: boolean;
  email?: string;
  address?: string;
  /** Liegenschaft / property. */
  propertyLabel?: string;
  /** Unit / Wohnung / Mietobjekt. */
  unit?: string;
  /** Gewerk / Fachbereich (Handwerker). */
  trade?: string;
  /** Rental period / contract info (if present in source). */
  rentalStart?: string;
  rentalEnd?: string;
  rentalInfo?: string;
  /** Whole original source row, kept for debugging/audit. */
  raw?: Record<string, unknown>;
  externalId?: string;
}

/**
 * Maps logical customer fields to source column HEADER NAMES (not positions),
 * so reordering columns in the source file does not break the sync.
 * An empty string means the field is not present in the source file.
 */
export interface SpreadsheetColumnMapping {
  name: string;
  firstName: string;
  phone: string;
  email: string;
  street: string;
  zip: string;
  city: string;
  address: string;
  /** property */
  propertyLabel: string;
  /** unit / Wohnung */
  unit: string;
  rentalStart: string;
  rentalEnd: string;
  /** contract_info */
  rentalInfo: string;
  /** Gewerk / Fachbereich (Handwerker-Listen). */
  trade: string;
}

/** Per-field confidence (0–1) for an AI-suggested mapping. */
export type ColumnMappingConfidence = Partial<
  Record<keyof SpreadsheetColumnMapping, number>
>;

/** Stats produced when applying a mapping, surfaced in the pre-save preview. */
export interface MappingPreviewStats {
  totalRows: number;
  validRows: number;
  normalizablePhones: number;
  unmatchedPhones: number;
  problems: Array<{ rowNumber: number; reason: string }>;
}

export interface CustomerAppointment {
  id: string;
  title: string;
  startIso: string;
  endIso: string;
  eventUrl?: string;
}

export interface CustomerWithAppointments extends CustomerRecord {
  appointments: CustomerAppointment[];
}

export interface CraftsmanWithAppointments extends CustomerWithAppointments {
  recordType: "craftsman";
}

export interface CustomersApiResponse {
  ok: boolean;
  connected: boolean;
  calendarConnected: boolean;
  activeProvider?: CustomerDataProviderId;
  sourceReady: boolean;
  providers: Array<{
    id: CustomerDataProviderId;
    name: string;
    connected: boolean;
  }>;
  customers: CustomerWithAppointments[];
  craftsmen: CraftsmanWithAppointments[];
  lastSyncedAt?: string;
  syncing?: boolean;
  error?: string;
}
