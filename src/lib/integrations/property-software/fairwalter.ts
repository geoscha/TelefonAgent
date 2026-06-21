import "server-only";

import type { PropertySoftwareConnection } from "@/lib/integrations/property-software/store";

const DEFAULT_API_BASE = "https://api.fairwalter.com";

export function normalizeFairwalterBaseUrl(input: string): string {
  let value = input.trim().replace(/\s+/g, "");
  if (!value) return DEFAULT_API_BASE;
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  return value.replace(/\/+$/, "");
}

/**
 * Validate Fairwalter partner API credentials.
 * Fairwalter provides API access to integration partners (Bearer token).
 */
export async function fairwalterConnect(
  baseUrl: string,
  apiKey: string,
  tenantId?: string
): Promise<Partial<PropertySoftwareConnection>> {
  const normalizedUrl = normalizeFairwalterBaseUrl(baseUrl);
  const key = apiKey.trim();
  const tenant = tenantId?.trim();

  if (!key) {
    throw new Error("Bitte den API-Schlüssel von Fairwalter angeben.");
  }

  const probePaths = ["/v1/me", "/api/v1/me", "/api/v1/account", "/health"];

  let lastStatus: number | null = null;
  for (const path of probePaths) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const headers: Record<string, string> = {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      };
      if (tenant) headers["X-Tenant-Id"] = tenant;

      const response = await fetch(`${normalizedUrl}${path}`, {
        method: "GET",
        headers,
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeout);
      lastStatus = response.status;

      if (response.status === 401 || response.status === 403) {
        throw new Error("API-Schlüssel ungültig oder abgelaufen.");
      }
      if (response.ok) {
        let accountLabel = normalizedUrl.replace(/^https?:\/\//i, "");
        try {
          const body = (await response.json()) as {
            email?: string;
            name?: string;
            organisation?: string;
          };
          accountLabel =
            body.organisation ?? body.name ?? body.email ?? accountLabel;
        } catch {
          /* non-json health endpoint is fine */
        }

        return {
          connected: true,
          baseUrl: normalizedUrl,
          username: tenant || undefined,
          password: key,
          accountLabel,
          connectedAt: new Date().toISOString(),
        };
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("API-Schlüssel")) {
        throw error;
      }
      /* try next path */
    }
  }

  if (lastStatus === 404) {
    throw new Error(
      "Fairwalter API nicht gefunden. Bitte die API-Adresse prüfen — diese erhalten Sie von Fairwalter (partner@fairwalter.com)."
    );
  }

  throw new Error(
    "Fairwalter API nicht erreichbar. Prüfen Sie die API-Adresse und den Schlüssel."
  );
}

export async function fairwalterGet<T>(
  connection: PropertySoftwareConnection,
  path: string
): Promise<T> {
  if (!connection.baseUrl || !connection.password) {
    throw new Error("Fairwalter-Verbindung ist unvollständig.");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${connection.password}`,
    Accept: "application/json",
  };
  if (connection.username) {
    headers["X-Tenant-Id"] = connection.username;
  }

  const response = await fetch(`${connection.baseUrl}${path}`, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Fairwalter API fehlgeschlagen (${response.status}).`);
  }

  return (await response.json()) as T;
}

const FAIRWALTER_CUSTOMER_PATHS = [
  "/v1/tenants",
  "/v1/contacts",
  "/v1/customers",
  "/api/v1/tenants",
  "/api/v1/contacts",
  "/api/v1/customers",
];

function extractArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    for (const key of ["data", "items", "results", "tenants", "contacts", "customers"]) {
      if (Array.isArray(record[key])) return record[key] as unknown[];
    }
  }
  return [];
}

/** Try common Fairwalter endpoints for tenant/contact lists. */
export async function fairwalterListCustomers(
  connection: PropertySoftwareConnection
): Promise<unknown[]> {
  for (const path of FAIRWALTER_CUSTOMER_PATHS) {
    try {
      const data = await fairwalterGet<unknown>(connection, path);
      const rows = extractArray(data);
      if (rows.length > 0) return rows;
    } catch {
      /* try next path */
    }
  }
  return [];
}
