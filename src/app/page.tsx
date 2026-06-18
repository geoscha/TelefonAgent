import { CallRow } from "@/components/dashboard/CallRow";
import { WelcomeBanner } from "@/components/dashboard/WelcomeBanner";
import { EmptyState } from "@/components/brand/EmptyState";
import { QuotaGate } from "@/components/billing/QuotaGate";
import { getCallCounts, getFeedCalls } from "@/lib/store/calls-feed";
import { getProfile } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [counts, recentCalls, profile] = await Promise.all([
    getCallCounts(),
    getFeedCalls(),
    getProfile(),
  ]);

  const firstName = profile.name.trim().split(/\s+/)[0] || profile.name;

  return (
    <QuotaGate>
    <div className="space-y-section">
      <WelcomeBanner name={firstName} callsToday={counts.today} />

      <section>
        <div className="overflow-hidden rounded-card border border-stroke bg-surface">
          {recentCalls.length > 0 ? (
            <div className="divide-y divide-divider">
              {recentCalls.map((call) => (
                <CallRow key={call.id} call={call} />
              ))}
            </div>
          ) : (
            <EmptyState
              illustration="calls"
              title="Noch keine Anrufe"
              description="Sobald Ihr Telefonagent Anrufe entgegennimmt, erscheinen sie hier."
              gradient="cool"
            />
          )}
        </div>
      </section>
    </div>
    </QuotaGate>
  );
}
