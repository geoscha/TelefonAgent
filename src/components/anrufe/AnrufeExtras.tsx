"use client";

import { CallVolumeChart } from "@/components/telefonagent/CallVolumeChart";

export function AnrufeExtras({
  onStatsRefresh,
}: {
  onStatsRefresh?: () => void;
}) {
  return (
    <div className="mb-6">
      <CallVolumeChart onRefresh={onStatsRefresh} />
    </div>
  );
}
