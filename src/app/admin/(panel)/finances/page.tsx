"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  FinanceExecutiveDashboard,
  type FinanceDashboardData,
} from "@/components/admin/FinanceExecutiveDashboard";

export default function AdminFinancesPage() {
  const [data, setData] = useState<FinanceDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/finances");
      const json = await res.json();
      if (res.ok && json.ok) {
        setData(json as FinanceDashboardData);
      } else {
        toast.error("Finanzdaten konnten nicht geladen werden.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-[#525866]">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="landing-caption">Finanzdaten laden…</span>
      </div>
    );
  }

  if (!data) return null;

  return <FinanceExecutiveDashboard data={data} loading={loading} />;
}
