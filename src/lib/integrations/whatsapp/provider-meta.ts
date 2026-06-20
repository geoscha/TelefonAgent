export type WhatsAppAccountType = "business" | "personal";

export const WHATSAPP_ACCOUNT_LABELS: Record<WhatsAppAccountType, string> = {
  business: "WhatsApp Business",
  personal: "WhatsApp Privat",
};

export const WHATSAPP_INTEGRATION_META = {
  name: "WhatsApp",
  description:
    "Bestehendes WhatsApp-Profil verknüpfen und Chats in Linker verwalten.",
} as const;

export const WHATSAPP_PROFILE_COPY = {
  title: "Persönliches WhatsApp",
  intro:
    "Verknüpfen Sie Ihr eigenes WhatsApp-Profil mit Linker. Das machen Sie nur in Ihrem Profil auf Ihrem Telefon — kein Administrator und keine Team-Einrichtung nötig.",
  notConnectedHint:
    "Nach der Verknüpfung erscheinen Ihre WhatsApp-Chats im Tab «Nachrichten».",
  connectedHint: "Ihr persönliches WhatsApp ist mit Linker verknüpft.",
  privacyNote:
    "Die Verbindung gilt nur für Ihr Konto. Andere Nutzer verknüpfen ihr WhatsApp separat in ihrem eigenen Profil.",
  previewSteps: [
    "WhatsApp-Nummer eingeben und «Weiter» wählen.",
    "Auf dem Telefon: Einstellungen → Verknüpfte Geräte → Gerät hinzufügen.",
    "«Stattdessen mit Telefonnummer verknüpfen» wählen und den Linker-Code eingeben.",
    "Code bestätigen — fertig. Chats erscheinen unter «Nachrichten».",
  ],
} as const;

export const WHATSAPP_ONBOARDING_COPY = {
  numberHint:
    "Geben Sie die Nummer Ihres bestehenden WhatsApp-Profils ein. Die Nummer muss bereits bei WhatsApp registriert sein — es wird kein neues Konto angelegt.",
  pairingIntro:
    "Folgen Sie den Schritten auf Ihrem Telefon. Danach erscheinen Ihre Chats im Tab «Nachrichten».",
  pairingCodeLabel: "Linker-Code",
  pairingConfirmLabel: "Linker-Code bestätigen",
  pairingConfirmHint:
    "Geben Sie den Code erneut ein, nachdem Sie ihn in WhatsApp eingegeben haben.",
  verifyHint:
    "Geben Sie den 6-stelligen Bestätigungscode ein, den WhatsApp nach der Verknüpfung anzeigt.",
  doneTitle: "WhatsApp ist mit Linker verbunden",
  doneBody:
    "Eingehende WhatsApp-Nachrichten erscheinen jetzt unter «Nachrichten». Ihr Assistent kann darauf antworten.",
  nachrichtenCta: "Zu Nachrichten",
} as const;
