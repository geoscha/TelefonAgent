"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatTokenCount } from "@/lib/billing/quota-display";

interface Customer {
  id: string;
  name: string;
  email: string;
  tokenBalance: number;
  createdAt: string;
  curaNumber?: string;
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
    <div className="space-y-6">
      <h1>Kunden</h1>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <Input
          className="pl-9"
          placeholder="Suche…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="overflow-hidden rounded-card border border-stroke bg-surface">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-text-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : customers.length === 0 ? (
          <p className="py-16 text-center text-text-muted">Keine Kunden.</p>
        ) : (
          <table className="w-full text-left text-body">
            <thead>
              <tr className="border-b border-stroke bg-bg/50 text-caption text-text-muted">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Tokens</th>
                <th className="px-4 py-3 font-medium">Nummer</th>
                <th className="px-4 py-3 font-medium">Anrufe</th>
                <th className="px-4 py-3 font-medium">Support</th>
                <th className="px-4 py-3 font-medium">Registriert</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-bg/30">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/customers/${c.id}`}
                      className="block font-medium text-navy hover:text-accent"
                    >
                      {c.name || "—"}
                    </Link>
                    <p className="text-caption text-text-muted">{c.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={c.tokenBalance <= 0 ? "warning" : "default"}>
                      {formatTokenCount(c.tokenBalance)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-caption">
                    {c.curaNumber || "—"}
                  </td>
                  <td className="px-4 py-3">{c.callCount}</td>
                  <td className="px-4 py-3">
                    {(c.openSupportCount ?? 0) > 0 ? (
                      <div className="max-w-[200px]">
                        <Badge variant="warning">
                          {c.openSupportCount === 1
                            ? "Nachricht"
                            : `${c.openSupportCount} Nachrichten`}
                        </Badge>
                        {c.lastSupportPreview && (
                          <p className="mt-1 line-clamp-2 text-caption text-text-muted">
                            {c.lastSupportPreview}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-caption text-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-caption text-text-muted">
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
