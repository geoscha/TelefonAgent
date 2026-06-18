import { AnrufeList } from "@/components/anrufe/AnrufeList";
import { QuotaGate } from "@/components/billing/QuotaGate";
import { getAllFeedCalls } from "@/lib/store/calls-feed";

export const dynamic = "force-dynamic";

export default async function AnrufePage() {
  const calls = await getAllFeedCalls();

  return (
    <QuotaGate>
      <div className="space-y-6">
        <div>
          <h1>Anrufe</h1>
          <p className="mt-1 text-text-muted">
            Alle eingehenden Anrufe Ihres Telefonagenten ({calls.length}).
          </p>
        </div>
        <AnrufeList calls={calls} />
      </div>
    </QuotaGate>
  );
}
