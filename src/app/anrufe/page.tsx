import { CallRow } from "@/components/dashboard/CallRow";
import { WelcomeBanner } from "@/components/dashboard/WelcomeBanner";
import { EmptyState } from "@/components/brand/EmptyState";
import { QuotaGate } from "@/components/billing/QuotaGate";
import { getAllFeedCalls, getCallCounts } from "@/lib/store/calls-feed";
import { getProfile } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function AnrufePage() {
  const [calls, counts, profile] = await Promise.all([
    getAllFeedCalls(),
    getCallCounts(),
    getProfile(),
  ]);

  const firstName = profile.name.trim().split(/\s+/)[0] || profile.name;

  return (
    <QuotaGate>
      <div className="space-y-section">
        <WelcomeBanner
          name={firstName}
          highlight={counts.today}
          highlightSuffix="Erhaltene Anrufe heute"
        />
        <section>
          <div className="overflow-hidden rounded-card border border-stroke bg-surface">
            {calls.length > 0 ? (
              <div className="divide-y divide-divider">
                {calls.map((call) => (
                  <CallRow key={call.id} call={call} />
                ))}
              </div>
            ) : (
              <EmptyState illustration="calls" title="Noch keine Anrufe" />
            )}
          </div>
        </section>
      </div>
    </QuotaGate>
  );
}
