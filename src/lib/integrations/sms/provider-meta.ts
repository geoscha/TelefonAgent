export type SmsProviderId = "twilio" | "seven" | "aspsms";

export type SmsFieldId = "username" | "password" | "senderId";

export interface SmsFieldDef {
  id: SmsFieldId;
  label: string;
  type: "text" | "password";
  placeholder?: string;
  required?: boolean;
}

export interface SmsProviderMeta {
  id: SmsProviderId;
  name: string;
  description: string;
  connectHint: string;
  docsUrl?: string;
  regionLabel: string;
  fields: SmsFieldDef[];
}

export const SMS_PROVIDERS: SmsProviderId[] = ["twilio", "seven", "aspsms"];

export const SMS_PROVIDER_META: Record<SmsProviderId, SmsProviderMeta> = {
  twilio: {
    id: "twilio",
    name: "Twilio SMS",
    regionLabel: "CH / EU / weltweit",
    description:
      "Terminbestätigungen, Erinnerungen an Mieter und dringende Alerts an Verwalter — per SMS zuverlässiger als E-Mail.",
    connectHint:
      "Account SID, Auth Token und Absender-Nummer aus dem Twilio Console eingeben. Die Nummer muss SMS-fähig sein.",
    docsUrl: "https://www.twilio.com/docs/sms",
    fields: [
      {
        id: "username",
        label: "Account SID",
        type: "text",
        placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        required: true,
      },
      {
        id: "password",
        label: "Auth Token",
        type: "password",
        required: true,
      },
      {
        id: "senderId",
        label: "Absender-Nummer",
        type: "text",
        placeholder: "+41791234567",
        required: true,
      },
    ],
  },
  seven: {
    id: "seven",
    name: "Seven.io",
    regionLabel: "EU / DACH",
    description:
      "Günstiges EU-SMS-Gateway für Terminerinnerungen und Eil-Meldungen — hohe Zustellrate in der Schweiz und EU.",
    connectHint:
      "API-Schlüssel aus dem Seven.io Dashboard. Optional ein registrierter Absender-Name für ausgehende SMS.",
    docsUrl: "https://docs.seven.io/",
    fields: [
      {
        id: "password",
        label: "API-Schlüssel",
        type: "password",
        required: true,
      },
      {
        id: "senderId",
        label: "Absender-Name (optional)",
        type: "text",
        placeholder: "Verwaltung",
      },
    ],
  },
  aspsms: {
    id: "aspsms",
    name: "ASPSMS",
    regionLabel: "Schweiz",
    description:
      "Schweizer SMS-Anbieter — ideal für Mieter-Erinnerungen und Verwalter-Alerts mit lokaler Zustellung.",
    connectHint:
      "Userkey und Passwort aus Ihrem ASPSMS-Konto. Originator ist der angezeigte Absender (max. 11 Zeichen).",
    docsUrl: "https://www.aspsms.com/en/api/",
    fields: [
      {
        id: "username",
        label: "Userkey",
        type: "text",
        required: true,
      },
      {
        id: "password",
        label: "Passwort",
        type: "password",
        required: true,
      },
      {
        id: "senderId",
        label: "Originator",
        type: "text",
        placeholder: "Verwaltung",
        required: true,
      },
    ],
  },
};

export function smsDefaultFieldValues(
  provider: SmsProviderId
): Record<SmsFieldId, string> {
  const values: Record<SmsFieldId, string> = {
    username: "",
    password: "",
    senderId: "",
  };
  for (const field of SMS_PROVIDER_META[provider].fields) {
    values[field.id] = "";
  }
  return values;
}
