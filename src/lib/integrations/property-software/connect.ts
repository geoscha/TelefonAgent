import "server-only";

import { fairwalterConnect } from "@/lib/integrations/property-software/fairwalter";
import { garaioRemConnect } from "@/lib/integrations/property-software/garaio-rem";
import { wwDmsConnect } from "@/lib/integrations/property-software/ww-dms-rest";
import type { PropertySoftwareProviderId } from "@/lib/integrations/property-software/provider-meta";
import type { PropertySoftwareConnection } from "@/lib/integrations/property-software/store";

export interface PropertySoftwareConnectInput {
  baseUrl?: string;
  username?: string;
  password?: string;
  apiKey?: string;
  tenantId?: string;
}

export async function connectPropertySoftware(
  provider: PropertySoftwareProviderId,
  input: PropertySoftwareConnectInput
): Promise<Partial<PropertySoftwareConnection>> {
  const baseUrl = input.baseUrl?.trim() ?? "";
  const username = input.username?.trim() ?? "";
  const password = input.password?.trim() ?? "";
  const apiKey = input.apiKey?.trim() ?? password;

  switch (provider) {
    case "immotop2":
      return wwDmsConnect("ImmoTop2", baseUrl, username, password);
    case "rimo_r5":
      return wwDmsConnect("Rimo R5", baseUrl, username, password);
    case "garaio_rem":
      return garaioRemConnect(baseUrl, username, password);
    case "fairwalter":
      return fairwalterConnect(baseUrl, apiKey, username || input.tenantId);
    case "abacus":
      if (!baseUrl || !password) {
        throw new Error("Bitte Server-Adresse und Passwort angeben.");
      }
      return {
        connected: true,
        baseUrl,
        username: username || undefined,
        password,
        accountLabel: baseUrl.replace(/^https?:\/\//i, ""),
        connectedAt: new Date().toISOString(),
      };
    case "excel":
      throw new Error("Excel wird über Microsoft OAuth verbunden.");
    default:
      throw new Error("Unbekannter Anbieter.");
  }
}
