export type PropertySoftwareAuthType =
  | "ww_dms"
  | "client_credentials"
  | "api_key"
  | "basic"
  | "oauth_microsoft";

export type PropertySoftwareProviderId =
  | "immotop2"
  | "abacus"
  | "fairwalter"
  | "garaio_rem"
  | "rimo_r5"
  | "excel"
  | "upload"
  | "gsheet";

export interface PropertySoftwareFieldDef {
  id: "baseUrl" | "username" | "password" | "apiKey" | "tenantId";
  label: string;
  type: "url" | "text" | "password";
  placeholder?: string;
  required?: boolean;
}

export interface PropertySoftwareProviderMeta {
  id: PropertySoftwareProviderId;
  name: string;
  description: string;
  authType: PropertySoftwareAuthType;
  connectHint: string;
  docsUrl?: string;
  liveValidated: boolean;
  /** Form fields for credential-based connect dialog. */
  fields: PropertySoftwareFieldDef[];
}

export const PROPERTY_SOFTWARE_PROVIDERS: PropertySoftwareProviderId[] = [
  "immotop2",
  "rimo_r5",
  "garaio_rem",
  "fairwalter",
  "abacus",
  "excel",
];

export const PROPERTY_SOFTWARE_PROVIDER_META: Record<
  PropertySoftwareProviderId,
  PropertySoftwareProviderMeta
> = {
  immotop2: {
    id: "immotop2",
    name: "ImmoTop2",
    description:
      "Liegenschafts- und Mieterdaten aus ImmoTop2 (W&W) — Anliegen und Termine werden der richtigen Liegenschaft zugeordnet.",
    authType: "ww_dms",
    connectHint:
      "Verbindung über die ImmoTop2 REST-Schnittstelle (W&W). Server-Adresse und Passwort eingeben — der REST-Service muss für Linker erreichbar sein.",
    docsUrl: "https://github.com/wwimmo/immotop2-dms-schnittstelle",
    liveValidated: true,
    fields: [
      {
        id: "baseUrl",
        label: "Server-Adresse",
        type: "url",
        placeholder: "https://immotop.ihre-firma.ch:5100",
        required: true,
      },
      {
        id: "username",
        label: "Benutzer",
        type: "text",
        placeholder: "wwdms",
      },
      {
        id: "password",
        label: "Passwort (von W&W)",
        type: "password",
        required: true,
      },
    ],
  },
  rimo_r5: {
    id: "rimo_r5",
    name: "Rimo R5",
    description:
      "Bewirtschaftungsdaten aus Rimo R5 (W&W) — Liegenschaften, Objekte und Mieter für den Telefonassistenten.",
    authType: "ww_dms",
    connectHint:
      "Verbindung über die Rimo R5 REST-Schnittstelle (W&W DMS). Server-Adresse und Zugangsdaten von W&W eingeben.",
    docsUrl: "https://github.com/wwimmo/rimor5-dms-schnittstelle",
    liveValidated: true,
    fields: [
      {
        id: "baseUrl",
        label: "Server-Adresse",
        type: "url",
        placeholder: "https://rimo.ihre-firma.ch:5100",
        required: true,
      },
      {
        id: "username",
        label: "Benutzer",
        type: "text",
        placeholder: "wwdms",
      },
      {
        id: "password",
        label: "Passwort (von W&W)",
        type: "password",
        required: true,
      },
    ],
  },
  garaio_rem: {
    id: "garaio_rem",
    name: "GARAIO REM",
    description:
      "Immobilienstammdaten aus GARAIO REM — Liegenschaften, Objekte und Pendenzen für Linker.",
    authType: "client_credentials",
    connectHint:
      "Verbindung über die GARAIO REM GraphQL-API. Server-Adresse, Client-ID und Client-Secret eingeben.",
    docsUrl: "https://github.com/Garaio-REM/grem-graphql-api",
    liveValidated: true,
    fields: [
      {
        id: "baseUrl",
        label: "GARAIO REM Server",
        type: "url",
        placeholder: "https://ihre-instanz.garaio-rem.net",
        required: true,
      },
      {
        id: "username",
        label: "Client-ID",
        type: "text",
        required: true,
      },
      {
        id: "password",
        label: "Client-Secret",
        type: "password",
        required: true,
      },
    ],
  },
  fairwalter: {
    id: "fairwalter",
    name: "Fairwalter",
    description:
      "Cloud-ERP für Immobilienverwaltung — Mieter, Liegenschaften und Schadensmeldungen synchronisieren.",
    authType: "api_key",
    connectHint:
      "API-Schlüssel von Fairwalter (Partner-Integration). Optional Mandanten-ID und eigene API-Adresse, falls von Fairwalter mitgeteilt.",
    docsUrl: "https://www.fairwalter.com/unternehmen/partner",
    liveValidated: true,
    fields: [
      {
        id: "apiKey",
        label: "API-Schlüssel",
        type: "password",
        required: true,
      },
      {
        id: "baseUrl",
        label: "API-Adresse (optional)",
        type: "url",
        placeholder: "https://api.fairwalter.com",
      },
      {
        id: "tenantId",
        label: "Mandanten-ID (optional)",
        type: "text",
      },
    ],
  },
  abacus: {
    id: "abacus",
    name: "Abacus",
    description:
      "Immobilienverwaltung in Abacus — Reparaturmeldungen und Aufträge fliessen direkt in Ihre Bewirtschaftung.",
    authType: "basic",
    connectHint:
      "Server-Adresse und Zugangsdaten Ihres Abacus-Mandanten eingeben.",
    liveValidated: false,
    fields: [
      {
        id: "baseUrl",
        label: "Server-Adresse",
        type: "url",
        placeholder: "https://abacus.ihre-firma.ch",
        required: true,
      },
      {
        id: "username",
        label: "Benutzer",
        type: "text",
      },
      {
        id: "password",
        label: "Passwort",
        type: "password",
        required: true,
      },
    ],
  },
  excel: {
    id: "excel",
    name: "Microsoft Excel",
    description:
      "Excel-Dateien aus OneDrive oder SharePoint — Liegenschaftslisten und Stammdaten für den Assistenten.",
    authType: "oauth_microsoft",
    connectHint:
      "Verbindung über Ihr Microsoft-Konto (OneDrive / SharePoint). Linker liest Excel-Dateien (.xlsx) für Stammdaten.",
    liveValidated: true,
    fields: [],
  },
  // Configured from the Kunden tab (not the integrations hub), hence not part
  // of PROPERTY_SOFTWARE_PROVIDERS. Meta exists so name lookups work.
  upload: {
    id: "upload",
    name: "Datei-Upload (.xlsx/.csv)",
    description:
      "Direkter Upload einer Excel- oder CSV-Datei mit Mieter-/Kundendaten.",
    authType: "api_key",
    connectHint: "Laden Sie eine .xlsx- oder .csv-Datei hoch.",
    liveValidated: true,
    fields: [],
  },
  gsheet: {
    id: "gsheet",
    name: "Google Sheet",
    description:
      "Verlinktes Google Sheet (Freigabe «Jeder mit dem Link») mit Mieter-/Kundendaten.",
    authType: "api_key",
    connectHint:
      "Geben Sie die Freigabe-URL des Google Sheets an (Lesezugriff «Jeder mit dem Link»).",
    liveValidated: true,
    fields: [],
  },
};

export function propertySoftwareDefaultFieldValues(
  provider: PropertySoftwareProviderId
): Record<string, string> {
  const meta = PROPERTY_SOFTWARE_PROVIDER_META[provider];
  const values: Record<string, string> = {};
  for (const field of meta.fields) {
    if (field.id === "username" && meta.authType === "ww_dms") {
      values[field.id] = "wwdms";
    } else {
      values[field.id] = "";
    }
  }
  return values;
}
