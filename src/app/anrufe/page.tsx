import { AnrufePageClient } from "@/components/anrufe/AnrufePageClient";
import { QuotaGate } from "@/components/billing/QuotaGate";

export default function AnrufePage() {
  return (
    <QuotaGate>
      <AnrufePageClient />
    </QuotaGate>
  );
}
