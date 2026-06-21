import "server-only";

import type { CustomerDataProviderId } from "@/lib/customers/types";
import { CUSTOMER_DATA_PROVIDERS, isCustomerDataProvider } from "@/lib/customers/types";
import type { PropertySoftwareProviderId } from "@/lib/integrations/property-software/provider-meta";
import {
  getPropertySoftwareConnections,
  type PropertySoftwareConnection,
} from "@/lib/integrations/property-software/store";
import { getSettings, updateSettings } from "@/lib/store";

export async function getActiveCustomerDataProvider(): Promise<
  CustomerDataProviderId | undefined
> {
  const settings = await getSettings();
  const provider = settings.customerDataProvider;
  if (!provider || !isCustomerDataProvider(provider)) return undefined;
  return provider;
}

export async function setActiveCustomerDataProvider(
  provider: CustomerDataProviderId
): Promise<void> {
  await updateSettings({ customerDataProvider: provider });
}

export function isCustomerSourceConfigured(
  provider: CustomerDataProviderId,
  connection?: PropertySoftwareConnection
): boolean {
  if (!connection?.connected) return false;
  if (provider === "excel") return Boolean(connection.workbookId);
  if (provider === "upload") return Boolean(connection.fileRef);
  if (provider === "gsheet") return Boolean(connection.gsheetUrl);
  return true;
}

/**
 * Upload and Google Sheet are always selectable in the picker (no OAuth);
 * they become "connected" once a file is uploaded / a sheet is linked.
 */
export function isSelfServeSource(provider: CustomerDataProviderId): boolean {
  return provider === "upload" || provider === "gsheet";
}

export async function getCustomerSourceContext(): Promise<{
  activeProvider?: CustomerDataProviderId;
  connections: Partial<
    Record<PropertySoftwareProviderId, PropertySoftwareConnection>
  >;
}> {
  const [settings, connections] = await Promise.all([
    getSettings(),
    getPropertySoftwareConnections(),
  ]);

  const activeProvider =
    settings.customerDataProvider &&
    isCustomerDataProvider(settings.customerDataProvider)
      ? settings.customerDataProvider
      : undefined;

  return { activeProvider, connections };
}

export function listCustomerSourceProviders(
  connections: Partial<
    Record<PropertySoftwareProviderId, PropertySoftwareConnection>
  >
): Array<{
  id: CustomerDataProviderId;
  connected: boolean;
  configured: boolean;
}> {
  return CUSTOMER_DATA_PROVIDERS.map((id) => {
    const connection = connections[id];
    return {
      id,
      // Upload / Google Sheet need no prior OAuth connection to be offered.
      connected: isSelfServeSource(id) || Boolean(connection?.connected),
      configured: isCustomerSourceConfigured(id, connection),
    };
  });
}
