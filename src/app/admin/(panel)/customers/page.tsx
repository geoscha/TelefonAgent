"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import {
  adminPanelClass,
  adminTableClass,
  adminTableHeadClass,
} from "@/components/admin/admin-ui";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatTokenCount } from "@/lib/billing/quota-display";

interface Customer {
  id: string;
  name: string;
  email: string;
  tokenBalance: number;
  createdAt: string;
  linkerNumber?: string;
  onboardingPhase?: string;
  callCount: number;
  lastCallAt?: string;
  openSupportCount?: number;
  lastSupportPreview?: string;
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      const res = await fetch(`/api/admin/customers?${params}`);
      const data = await res.json();
      if (res.ok && data.ok) {
        setCustomers(data.customers as Customer[]);
      } else {
        toast.error("Kunden konnten nicht geladen werden.");
      }
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <Input
          className="pl-9"
          placeholder="Suche…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className={`overflow-hidden ${adminPanelClass}`}>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[#525866]">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : customers.length === 0 ? (
          <p className="py-16 text-center landing-body text-[#525866]">—</p>
        ) : (
          <table className={adminTableClass}>
            <thead>
              <tr className={adminTableHeadClass}>
                <th className="px-3 py-2.5 font-normal">Name</th>
                <th className="px-3 py-2.5 font-normal">Tokens</th>
                <th className="px-3 py-2.5 font-normal">Nummer</th>
                <th className="px-3 py-2.5 font-normal">Anrufe</th>
                <th className="px-3 py-2.5 font-normal">Support</th>
                <th className="px-3 py-2.5 font-normal">Seit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E1E4EA]">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-[#F5F7FA]/60">
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/admin/customers/${c.id}`}
                      className="block text-[#0E121B] hover:text-[#335cff]"
                    >
                      {c.name || "—"}
                    </Link>
                    <p className="landing-caption text-[#99A0AE]">{c.email}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={c.tokenBalance <= 0 ? "warning" : "default"}>
                      {formatTokenCount(c.tokenBalance)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 font-mono landing-caption">
                    {c.linkerNumber || "—"}
                  </td>
                  <td className="px-3 py-2.5">{c.callCount}</td>
                  <td className="px-3 py-2.5">
                    {(c.openSupportCount ?? 0) > 0 ? (
                      <div className="max-w-[200px]">
                        <Badge variant="warning">
                          {c.openSupportCount === 1
                            ? "Nachricht"
                            : `${c.openSupportCount}`}
                        </Badge>
                        {c.lastSupportPreview && (
                          <p className="mt-1 line-clamp-2 landing-caption text-[#99A0AE]">
                            {c.lastSupportPreview}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="landing-caption text-[#99A0AE]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 landing-caption text-[#525866]">
                    {new Date(c.createdAt).toLocaleDateString("de-CH")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
