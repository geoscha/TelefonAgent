import { UserPlaceholderPage } from "@/components/layout/UserPlaceholderPage";

export default function ApiKeysPage() {
  return (
    <UserPlaceholderPage
      title="API-Schlüssel"
      description="Verwalten Sie API-Schlüssel für die Integration von Cura in Ihre eigenen Systeme."
      bullets={[
        "Schlüssel erstellen und widerrufen",
        "Berechtigungen pro Schlüssel festlegen",
        "Nutzung und Ablaufdatum einsehen",
      ]}
    />
  );
}
