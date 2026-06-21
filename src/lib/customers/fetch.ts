import "server-only";

import {
  resolveConnectedCalendarProvider,
  type ListedCalendarEvent,
} from "@/lib/calendar";
import { defaultEventEndIso } from "@/lib/calendar/week-view";
import { getMirroredRangeEvents } from "@/lib/integrations/calendar-mirror/sync";
import {
  dedupeCustomers,
  normalizeGenericCustomer,
  normalizeSpreadsheetCustomers,
  normalizeWwMieter,
  buildWwLookupMaps,
  asRecordArray,
} from "@/lib/customers/normalize";
import { getCustomerRecords, getCraftsmanRecords } from "@/lib/customers/store";
import {
  getCustomerSourceContext,
  isCustomerSourceConfigured,
  listCustomerSourceProviders,
} from "@/lib/customers/source";
import type {
  CustomerAppointment,
  CustomerDataProviderId,
  CustomerRecord,
  CustomerWithAppointments,
} from "@/lib/customers/types";
import { excelLoadCustomerRows } from "@/lib/integrations/property-software/excel";
import { fairwalterListCustomers } from "@/lib/integrations/property-software/fairwalter";
import { garaioRemListCustomers } from "@/lib/integrations/property-software/garaio-rem";
import { PROPERTY_SOFTWARE_PROVIDER_META } from "@/lib/integrations/property-software/provider-meta";
import {
  type PropertySoftwareConnection,
} from "@/lib/integrations/property-software/store";
import { wwDmsGet } from "@/lib/integrations/property-software/ww-dms-rest";
import { getCalendars } from "@/lib/store";
import { requireUserId } from "@/lib/supabase/server";

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,]/g, "");
}

function nameTokens(name: string): string[] {
  return normalizeName(name).split(" ").filter(Boolean);
}

/**
 * Does the event text reference the customer's flat/object or address?
 * Useful for entries like «Handwerker Wohnung 3.2 Bahnhofstrasse 4» that name
 * the property instead of the tenant. Kept conservative to avoid mismatches.
 */
function eventMentionsProperty(text: string, customer: CustomerRecord): boolean {
  const label = normalizeName(customer.propertyLabel ?? "");
  if (label && label.length >= 4 && text.includes(label)) return true;

  const address = normalizeName(customer.address ?? "");
  if (address) {
    const tokens = address.split(" ").filter(Boolean);
    const streetToken = tokens.find(
      (token) =>
        /strasse|str|weg|gasse|platz|allee|ring/.test(token) || token.length >= 6
    );
    const numberToken = tokens.find((token) => /^\d{1,4}[a-z]?$/.test(token));
    if (
      streetToken &&
      numberToken &&
      text.includes(streetToken) &&
      text.includes(numberToken)
    ) {
      return true;
    }
  }

  return false;
}

function eventMatchesCustomer(
  event: ListedCalendarEvent,
  customer: CustomerRecord
): boolean {
  const title = normalizeName(event.title);
  const description = normalizeName(event.description ?? "");
  const text = `${title} ${description}`.trim();
  const customerName = normalizeName(customer.name);
  const tokens = nameTokens(customer.name);

  if (!text) return false;

  if (title.includes(customerName) || description.includes(customerName)) {
    return true;
  }

  // Full first + last name in any order (covers «Vorname Nachname» columns).
  if (tokens.length >= 2) {
    const allPresent = tokens.every(
      (token) => token.length >= 2 && text.includes(token)
    );
    if (allPresent) return true;
  }

  const lastName = tokens[tokens.length - 1];
  if (lastName && lastName.length >= 3) {
    if (title.startsWith(`${lastName} `) || title.startsWith(`${lastName}-`)) {
      return true;
    }
    if (title.includes(` ${lastName}`) || title.includes(`-${lastName}`)) {
      return true;
    }
  }

  if (customer.phone) {
    const digits = customer.phone.replace(/\D/g, "");
    if (digits.length >= 6) {
      const haystack = `${event.title} ${event.description ?? ""}`.replace(
        /\D/g,
        ""
      );
      if (haystack.includes(digits.slice(-8))) return true;
    }
  }

  if (eventMentionsProperty(text, customer)) return true;

  return false;
}

async function loadCalendarEvents(): Promise<{
  connected: boolean;
  events: ListedCalendarEvent[];
}> {
  const allCalendars = await getCalendars();
  const provider = resolveConnectedCalendarProvider(allCalendars);
  if (!provider || !allCalendars[provider]?.connected) {
    return { connected: false, events: [] };
  }

  const userId = await requireUserId();

  const now = new Date();
  const start = new Date(now);
  start.setMonth(start.getMonth() - 1);
  const end = new Date(now);
  end.setMonth(end.getMonth() + 3);

  // Read from the Supabase mirror, not live from the calendar API.
  const events = await getMirroredRangeEvents({
    userId,
    rangeStartIso: start.toISOString(),
    rangeEndIso: end.toISOString(),
  });

  return {
    connected: true,
    events: events.filter((event) => !event.cancelled),
  };
}

function attachAppointments(
  customers: CustomerRecord[],
  events: ListedCalendarEvent[]
): CustomerWithAppointments[] {
  return customers.map((customer) => {
    const appointments: CustomerAppointment[] = events
      .filter((event) => eventMatchesCustomer(event, customer))
      .map((event) => ({
        id: event.id,
        title: event.title,
        startIso: event.startIso,
        endIso: event.endIso ?? defaultEventEndIso(event.startIso),
        eventUrl: event.eventUrl,
      }))
      .sort(
        (a, b) =>
          new Date(a.startIso).getTime() - new Date(b.startIso).getTime()
      );

    return { ...customer, appointments };
  });
}

async function fetchWwDmsCustomers(
  provider: CustomerDataProviderId,
  connection: PropertySoftwareConnection
): Promise<CustomerRecord[]> {
  const [mieter, verhaeltnis, liegenschaften, objekte] = await Promise.all([
    wwDmsGet<unknown>(connection, "GetDmsMieter"),
    wwDmsGet<unknown>(connection, "GetDmsVerhaeltnis"),
    wwDmsGet<unknown>(connection, "GetDmsLiegenschaft"),
    wwDmsGet<unknown>(connection, "GetDmsObjekt"),
  ]);

  const maps = buildWwLookupMaps(liegenschaften, objekte, verhaeltnis);

  return asRecordArray(mieter).map((row, index) =>
    normalizeWwMieter(provider, row, index, maps)
  );
}

export async function fetchProviderCustomers(
  provider: CustomerDataProviderId,
  connection: PropertySoftwareConnection
): Promise<CustomerRecord[]> {
  switch (provider) {
    case "immotop2":
    case "rimo_r5":
      return fetchWwDmsCustomers(provider, connection);
    case "garaio_rem":
      return asRecordArray(await garaioRemListCustomers(connection)).map(
        (row, index) => normalizeGenericCustomer(provider, row, index)
      );
    case "fairwalter":
      return asRecordArray(await fairwalterListCustomers(connection)).map(
        (row, index) => normalizeGenericCustomer(provider, row, index)
      );
    case "excel":
      return normalizeSpreadsheetCustomers(
        provider,
        await excelLoadCustomerRows(connection)
      );
    default:
      return [];
  }
}

export async function fetchCustomersWithAppointments(): Promise<{
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
  craftsmen: CustomerWithAppointments[];
  lastSyncedAt?: string;
  errors: string[];
}> {
  const { activeProvider, connections } = await getCustomerSourceContext();
  const providers = listCustomerSourceProviders(connections).map((entry) => ({
    id: entry.id,
    name: PROPERTY_SOFTWARE_PROVIDER_META[entry.id].name,
    connected: entry.connected,
  }));

  const anyConnected = providers.some((provider) => provider.connected);
  const sourceReady = Boolean(
    activeProvider &&
      isCustomerSourceConfigured(activeProvider, connections[activeProvider])
  );

  const errors: string[] = [];

  const customers = dedupeCustomers(
    await getCustomerRecords(activeProvider)
  );
  const craftsmen = dedupeCustomers(await getCraftsmanRecords(activeProvider));

  const lastSyncedAt = activeProvider
    ? connections[activeProvider]?.lastSyncedAt
    : undefined;

  const { connected: calendarConnected, events } = await loadCalendarEvents();

  return {
    connected: anyConnected,
    sourceReady: Boolean(activeProvider && sourceReady),
    activeProvider,
    calendarConnected,
    providers,
    customers: attachAppointments(customers, events),
    craftsmen: attachAppointments(craftsmen, events),
    lastSyncedAt: lastSyncedAt ?? undefined,
    errors,
  };
}
