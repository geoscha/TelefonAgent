export type MailProviderId = "gmail" | "outlook" | "apple_mail";

export interface MailProviderMeta {
  id: MailProviderId;
  name: string;
  description: string;
}

export const MAIL_PROVIDERS: MailProviderId[] = [
  "gmail",
  "outlook",
  "apple_mail",
];

export const MAIL_PROVIDER_META: Record<MailProviderId, MailProviderMeta> = {
  gmail: {
    id: "gmail",
    name: "Gmail",
    description:
      "Persönliches Gmail-Konto verbinden — E-Mails erscheinen unter «Nachrichten».",
  },
  outlook: {
    id: "outlook",
    name: "Outlook Mail",
    description: "E-Mails über Microsoft 365 oder Outlook.com verwalten.",
  },
  apple_mail: {
    id: "apple_mail",
    name: "Apple Mail",
    description: "E-Mails über iCloud Mail mit App-Passwort verbinden.",
  },
};
