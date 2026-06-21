import type { PropertySoftwareProviderId } from "@/lib/integrations/property-software/provider-meta";

/** ERP / Excel sources that supply tenant/customer master data. */
export const CUSTOMER_DATA_PROVIDERS = [
  "immotop2",
  "rimo_r5",
  "garaio_rem",
  "fairwalter",
  "excel",
] as const;

export type CustomerDataProviderId = (typeof CUSTOMER_DATA_PROVIDERS)[number];

export function isCustomerDataProvider(
  provider: string
): provider is CustomerDataProviderId {
  return (CUSTOMER_DATA_PROVIDERS as readonly string[]).includes(provider);
}

export interface CustomerRecord {
  id: string;
  provider: CustomerDataProviderId;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  propertyLabel?: string;
  /** Rental period / contract info (if present in source). */
  rentalStart?: string;
  rentalEnd?: string;
  rentalInfo?: string;
  externalId?: string;
}

/**
 * Maps logical customer fields to zero-based spreadsheet column indices.
 * `-1` means the field is not present in the source file.
 */
export interface SpreadsheetColumnMapping {
  name: number;
  firstName: number;
  phone: number;
  email: number;
  street: number;
  zip: number;
  city: number;
  address: number;
  propertyLabel: number;
  rentalStart: number;
  rentalEnd: number;
  rentalInfo: number;
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
  lastSyncedAt?: string;
  syncing?: boolean;
  error?: string;
}
