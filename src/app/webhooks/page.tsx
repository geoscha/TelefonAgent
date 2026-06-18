import { UserPlaceholderPage } from "@/components/layout/UserPlaceholderPage";

export default function WebhooksPage() {
  return (
    <UserPlaceholderPage
      title="Webhooks"
      description="Empfangen Sie Ereignisse in Echtzeit, wenn Anrufe abgeschlossen werden oder Agenten aktualisiert werden."
      bullets={[
        "Webhook-Endpunkte konfigurieren",
        "Ereignistypen auswählen",
        "Signatur zur Verifizierung anzeigen",
        "Zustellungsprotokoll einsehen",
      ]}
    />
  );
}
