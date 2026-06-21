import "server-only";

import type { PropertySoftwareConnection } from "@/lib/integrations/property-software/store";

/** W&W DMS REST default Basic-Auth user (ImmoTop2 / Rimo R5). */
export const WW_DMS_DEFAULT_USER = "wwdms";

const WW_DMS_VERSION_HEADER = "1.0";
const REST_SEGMENT = "api/DmsRestServices";

export function normalizeWwDmsBaseUrl(input: string): string {
  let value = input.trim().replace(/\s+/g, "");
  if (!value) return "";
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  value = value.replace(/\/+$/, "");
  value = value.replace(/\/api\/DmsRestServices$/i, "");
  return value;
}

function basicAuthHeader(username: string, password: string): string {
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${token}`;
}

function wwDmsEndpoint(baseUrl: string, method: string): string {
  return `${normalizeWwDmsBaseUrl(baseUrl)}/${REST_SEGMENT}/${method}`;
}

export async function wwDmsConnect(
  productLabel: string,
  baseUrl: string,
  username: string,
  password: string
): Promise<Partial<PropertySoftwareConnection>> {
  const normalizedUrl = normalizeWwDmsBaseUrl(baseUrl);
  const user = username.trim() || WW_DMS_DEFAULT_USER;
  const pass = password.trim();

  if (!normalizedUrl) {
    throw new Error(`Bitte die Server-Adresse von ${productLabel} angeben.`);
  }
  if (!pass) {
    throw new Error("Bitte das von W&W gelieferte Passwort angeben.");
  }

  const endpoint = wwDmsEndpoint(normalizedUrl, "Test");

  let response: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: basicAuthHeader(user, pass),
        Version: WW_DMS_VERSION_HEADER,
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
  } catch {
    throw new Error(
      `${productLabel}-Server nicht erreichbar. Prüfen Sie die Server-Adresse und ob der REST-Service von aussen erreichbar ist.`
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      "Anmeldung abgelehnt. Bitte Benutzer und Passwort (von W&W) prüfen."
    );
  }
  if (response.status === 404) {
    throw new Error(
      "REST-Service nicht gefunden. Bitte die Server-Adresse prüfen (z. B. https://server:5100)."
    );
  }
  if (!response.ok) {
    throw new Error(
      `${productLabel} hat mit Fehler ${response.status} geantwortet. Bitte Konfiguration prüfen.`
    );
  }

  return {
    connected: true,
    baseUrl: normalizedUrl,
    username: user,
    password: pass,
    accountLabel: normalizedUrl.replace(/^https?:\/\//i, ""),
    connectedAt: new Date().toISOString(),
  };
}

export async function wwDmsGet<T>(
  connection: PropertySoftwareConnection,
  method: string,
  query?: Record<string, string | number>
): Promise<T> {
  if (!connection.baseUrl || !connection.password) {
    throw new Error("W&W DMS-Verbindung ist unvollständig.");
  }

  const url = new URL(wwDmsEndpoint(connection.baseUrl, method));
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: basicAuthHeader(
        connection.username ?? WW_DMS_DEFAULT_USER,
        connection.password
      ),
      Version: WW_DMS_VERSION_HEADER,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`W&W DMS ${method} fehlgeschlagen (${response.status}).`);
  }

  return (await response.json()) as T;
}
