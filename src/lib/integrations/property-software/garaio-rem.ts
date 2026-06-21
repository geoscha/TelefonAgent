import "server-only";

import type { PropertySoftwareConnection } from "@/lib/integrations/property-software/store";

export function normalizeGaraioBaseUrl(input: string): string {
  let value = input.trim().replace(/\s+/g, "");
  if (!value) return "";
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  value = value.replace(/\/+$/, "");
  value = value.replace(/\/external\/graphql(\/authenticate\/token)?$/i, "");
  return value;
}

function tokenEndpoint(baseUrl: string): string {
  return `${normalizeGaraioBaseUrl(baseUrl)}/external/graphql/authenticate/token`;
}

function graphqlEndpoint(baseUrl: string): string {
  return `${normalizeGaraioBaseUrl(baseUrl)}/external/graphql`;
}

/**
 * Authenticate against GARAIO REM GraphQL API (client_credentials).
 * @see https://github.com/Garaio-REM/grem-graphql-api
 */
export async function garaioRemConnect(
  baseUrl: string,
  clientId: string,
  clientSecret: string
): Promise<Partial<PropertySoftwareConnection>> {
  const normalizedUrl = normalizeGaraioBaseUrl(baseUrl);
  const id = clientId.trim();
  const secret = clientSecret.trim();

  if (!normalizedUrl) {
    throw new Error("Bitte die GARAIO REM Server-Adresse angeben.");
  }
  if (!id || !secret) {
    throw new Error("Bitte Client-ID und Client-Secret angeben.");
  }

  let response: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    response = await fetch(tokenEndpoint(normalizedUrl), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: id,
        client_secret: secret,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
  } catch {
    throw new Error(
      "GARAIO REM nicht erreichbar. Prüfen Sie die Server-Adresse."
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error("Client-ID oder Client-Secret ungültig.");
  }
  if (!response.ok) {
    throw new Error(
      `GARAIO REM Authentifizierung fehlgeschlagen (${response.status}).`
    );
  }

  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!data.access_token) {
    throw new Error("GARAIO REM hat keinen Zugriffstoken zurückgegeben.");
  }

  const expiresAt = data.expires_in
    ? Date.now() + data.expires_in * 1000
    : undefined;

  return {
    connected: true,
    baseUrl: normalizedUrl,
    username: id,
    password: secret,
    accessToken: data.access_token,
    expiresAt,
    accountLabel: normalizedUrl.replace(/^https?:\/\//i, ""),
    connectedAt: new Date().toISOString(),
  };
}

export async function garaioRemGraphql<T>(
  connection: PropertySoftwareConnection,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  if (!connection.baseUrl) {
    throw new Error("GARAIO REM-Verbindung ist unvollständig.");
  }

  let token = connection.accessToken;
  if (!token || (connection.expiresAt && connection.expiresAt <= Date.now())) {
    const refreshed = await garaioRemConnect(
      connection.baseUrl,
      connection.username ?? "",
      connection.password ?? ""
    );
    token = refreshed.accessToken;
  }

  if (!token) {
    throw new Error("GARAIO REM Zugriffstoken fehlt.");
  }

  const response = await fetch(graphqlEndpoint(connection.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`GARAIO REM GraphQL fehlgeschlagen (${response.status}).`);
  }

  const json = (await response.json()) as { data?: T; errors?: unknown[] };
  if (json.errors?.length) {
    throw new Error("GARAIO REM GraphQL-Anfrage fehlgeschlagen.");
  }

  return json.data as T;
}

const GARAIO_CUSTOMER_QUERIES = [
  `query { tenants { id firstName lastName phone email street zip city } }`,
  `query { contacts { id firstName lastName phone email address { street zip city } } }`,
  `query { persons { id name phone email } }`,
  `query { customers { id name phone email address } }`,
];

function extractGaraioRows(data: unknown): unknown[] {
  if (!data || typeof data !== "object") return [];
  for (const value of Object.values(data as Record<string, unknown>)) {
    if (Array.isArray(value) && value.length > 0) return value;
  }
  return [];
}

/** Try common GARAIO REM GraphQL queries for tenant/contact data. */
export async function garaioRemListCustomers(
  connection: PropertySoftwareConnection
): Promise<unknown[]> {
  for (const query of GARAIO_CUSTOMER_QUERIES) {
    try {
      const data = await garaioRemGraphql<unknown>(connection, query);
      const rows = extractGaraioRows(data);
      if (rows.length > 0) return rows;
    } catch {
      /* permissions or unknown schema — try next query */
    }
  }
  return [];
}
