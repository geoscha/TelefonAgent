"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { GovernancePageClient } from "@/components/admin/governance/GovernancePageClient";
import type {
  GovernanceDraftConfig,
  GovernanceWorkflow,
} from "@/lib/governance/types";

export default function AdminGovernancePage() {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<GovernanceDraftConfig | null>(null);
  const [workflows, setWorkflows] = useState<GovernanceWorkflow[]>([]);
  const [currentVersion, setCurrentVersion] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/governance");
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error ?? "Laden fehlgeschlagen.");
    }
    setConfig(data.config);
    setWorkflows(data.workflows);
    setCurrentVersion(data.currentVersion);
  }, []);

  useEffect(() => {
    load()
      .catch((error) => {
        toast.error(
          error instanceof Error ? error.message : "Laden fehlgeschlagen."
        );
      })
      .finally(() => setLoading(false));
  }, [load]);

  if (loading || !config) {
    return (
      <div className="flex items-center gap-2 text-[#525866]">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="landing-caption">Governance laden…</span>
      </div>
    );
  }

  return (
    <GovernancePageClient
      initialConfig={config}
      initialWorkflows={workflows}
      currentVersion={currentVersion}
      onReload={load}
    />
  );
}
