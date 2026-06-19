import { CalendarIntegrations } from "@/components/integrations/CalendarIntegrations";
import { userLabelClass, userTitleClass } from "@/components/user/user-styles";

export default function IntegrationsPage() {
  return (
    <div className="mx-auto max-w-[960px] space-y-6">
      <div>
        <h1 className={userTitleClass}>Integrationen</h1>
        <p className={`${userLabelClass} mt-1`}>
          Verbinden Sie Kalender und weitere Dienste mit Ihrem Konto. Pro Agent
          legen Sie später fest, welche Integration genutzt wird.
        </p>
      </div>

      <CalendarIntegrations />
    </div>
  );
}
