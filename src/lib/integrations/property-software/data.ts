import "server-only";

import { excelListWorkbooks } from "@/lib/integrations/property-software/excel";
import { fairwalterGet } from "@/lib/integrations/property-software/fairwalter";
import { garaioRemGraphql } from "@/lib/integrations/property-software/garaio-rem";
import type { PropertySoftwareProviderId } from "@/lib/integrations/property-software/provider-meta";
import {
  getPropertySoftwareConnections,
  type PropertySoftwareConnection,
} from "@/lib/integrations/property-software/store";
import { wwDmsGet } from "@/lib/integrations/property-software/ww-dms-rest";

export async function getActivePropertySoftwareConnection(
  provider: PropertySoftwareProviderId
): Promise<PropertySoftwareConnection | null> {
  const map = await getPropertySoftwareConnections();
  const conn = map[provider];
  if (!conn?.connected) return null;
  return conn;
}

/** Load master data snapshot from the connected property ERP. */
export async function fetchPropertySoftwareData(
  provider: PropertySoftwareProviderId
): Promise<unknown> {
  const connection = await getActivePropertySoftwareConnection(provider);
  if (!connection) {
    throw new Error("Keine aktive Verbindung.");
  }

  switch (provider) {
    case "immotop2":
    case "rimo_r5":
      return {
        liegenschaften: await wwDmsGet(connection, "GetDmsLiegenschaft"),
        objekte: await wwDmsGet(connection, "GetDmsObjekt"),
        mieter: await wwDmsGet(connection, "GetDmsMieter"),
        unterhalt: await wwDmsGet(connection, "GetDmsUnterhalt"),
      };
    case "garaio_rem":
      return garaioRemGraphql(connection, `query { __typename }`);
    case "fairwalter":
      return {
        account: await fairwalterGet(connection, "/v1/me").catch(() =>
          fairwalterGet(connection, "/api/v1/me")
        ),
      };
    case "excel":
      return { workbooks: await excelListWorkbooks(connection) };
    case "abacus":
      return { connected: true, baseUrl: connection.baseUrl };
    default:
      throw new Error("Datenzugriff für diesen Anbieter noch nicht verfügbar.");
  }
}
