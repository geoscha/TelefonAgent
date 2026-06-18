import { CallRow } from "@/components/dashboard/CallRow";
import { WelcomeBanner } from "@/components/dashboard/WelcomeBanner";
import { AnrufeExtras } from "@/components/anrufe/AnrufeExtras";
import { EmptyState } from "@/components/brand/EmptyState";
import { userPanelClass } from "@/components/user/user-styles";
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
