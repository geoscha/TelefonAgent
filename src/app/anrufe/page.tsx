import { CallRow } from "@/components/dashboard/CallRow";
import { AnrufeExtras } from "@/components/anrufe/AnrufeExtras";
import { EmptyState } from "@/components/brand/EmptyState";
import { userPanelClass } from "@/components/user/user-styles";
import { QuotaGate } from "@/components/billing/QuotaGate";
import { getAllFeedCalls } from "@/lib/store/calls-feed";

export const dynamic = "force-dynamic";

export default async function AnrufePage() {
  const calls = await getAllFeedCalls();

  return (
    <QuotaGate>
      <div className="space-y-section">
        <AnrufeExtras />
        <section>
          <div className={`${userPanelClass} overflow-hidden`}>
            {calls.length > 0 ? (
              <div className="divide-y divide-[#E1E4EA]">
                {calls.map((call) => (
                  <CallRow key={call.id} call={call} />
                ))}
              </div>
            ) : (
              <EmptyState illustration="calls" title="Noch keine Anrufe" subtle />
            )}
          </div>
        </section>
      </div>
    </QuotaGate>
  );
}
