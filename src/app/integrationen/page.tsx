import { Suspense } from "react";
import { Loader2 } from "lucide-react";

import { IntegrationsHub } from "@/components/integrations/IntegrationsHub";

export const dynamic = "force-dynamic";

function IntegrationsLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-[#525866]" aria-label="Laden" />
    </div>
  );
}

export default function IntegrationenPage() {
  return (
    <Suspense fallback={<IntegrationsLoading />}>
      <IntegrationsHub />
    </Suspense>
  );
}
