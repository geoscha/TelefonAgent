"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  STATUS_LABELS,
  isPhoneNumberRequest,
  requestTypeLabel,
  type RequestStatus,
  type UserRequest,
} from "@/lib/admin/request-types";

interface PhoneSuggestion {
  phoneNumber: string;
  elevenLabsPhoneNumberId?: string;
}

function statusBadgeVariant(status: RequestStatus) {
  switch (status) {
    case "offen":
      return "warning" as const;
    case "in_arbeit":
      return "default" as const;
    case "erledigt":
      return "success" as const;
    case "abgelehnt":
      return "notfall" as const;
    default:
      return "default" as const;
  }
}

export default function AdminDashboardPage() {
  const [requests, setRequests] = useState<UserRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<RequestStatus | "all">("offen");
  const [search, setSearch] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [phoneDrafts, setPhoneDrafts] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<
    Record<string, PhoneSuggestion>
  >({});
  const [freeCount, setFreeCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status });
      if (search.trim()) params.set("q", search.trim());
      const res = await fetch(`/api/admin/requests?${params}`);
      const data = await res.json();
      if (res.ok && data.ok) {
        setRequests(data.requests as UserRequest[]);
        const sug = (data.suggestions ?? {}) as Record<string, PhoneSuggestion>;
        setSuggestions(sug);
        setFreeCount(data.freeCount ?? 0);
        setPhoneDrafts((prev) => {
          const next = { ...prev };
          for (const [id, s] of Object.entries(sug)) {
            if (!next[id]?.trim()) next[id] = s.phoneNumber;
          }
          return next;
        });
      } else {
        toast.error("Anfragen konnten nicht geladen werden.");
      }
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    load();
  }, [load]);

  async function assignPhoneNumber(id: string) {
    const phoneNumber = phoneDrafts[id]?.trim();
    if (!phoneNumber) {
      toast.error("Bitte die Twilio-Nummer eingeben.");
      return;
    }
    setActing(id);
    try {
      const res = await fetch(`/api/admin/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignPhone: {
            phoneNumber,
            elevenLabsPhoneNumberId:
              suggestions[id]?.elevenLabsPhoneNumberId,
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success("Nummer zugewiesen — User kann Weiterleitung einrichten.");
        await load();
      } else {
        toast.error(data.error ?? "Zuweisung fehlgeschlagen.");
      }
    } finally {
      setActing(null);
    }
  }

  async function rejectRequest(id: string) {
    setActing(id);
    try {
      const res = await fetch(`/api/admin/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "abgelehnt" }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success("Anfrage abgelehnt.");
        await load();
      } else {
        toast.error("Aktion fehlgeschlagen.");
      }
    } finally {
      setActing(null);
    }
  }

  const pendingPhoneCount = requests.filter(
    (r) =>
      isPhoneNumberRequest(r.type) &&
      (r.status === "offen" || r.status === "in_arbeit")
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1>Anfragen</h1>
        {freeCount > 0 && pendingPhoneCount > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-caption text-text-muted">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            {Math.min(freeCount, pendingPhoneCount)} von {pendingPhoneCount}{" "}
            Anfragen mit freier Nummer belegbar ({freeCount} frei)
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input
            className="pl-9"
            placeholder="Suche nach Name oder E-Mail…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as RequestStatus | "all")}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="offen">Offen</SelectItem>
            <SelectItem value="in_arbeit">In Arbeit</SelectItem>
            <SelectItem value="erledigt">Erledigt</SelectItem>
            <SelectItem value="abgelehnt">Abgelehnt</SelectItem>
            <SelectItem value="all">Alle</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-card border border-stroke bg-surface">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-text-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
            Laden…
          </div>
        ) : requests.length === 0 ? (
          <p className="py-16 text-center text-body text-text-muted">
            Keine Anfragen gefunden.
          </p>
        ) : (
          <table className="w-full text-left text-body">
            <thead>
              <tr className="border-b border-stroke bg-bg/50 text-caption text-text-muted">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Typ</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Datum</th>
                <th className="px-4 py-3 font-medium">Twilio-Nummer zuweisen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke">
              {requests.map((r) => {
                const isPhone = isPhoneNumberRequest(r.type);
                const assigned =
                  typeof r.payload.phoneNumber === "string"
                    ? r.payload.phoneNumber
                    : null;
                const suggested = suggestions[r.id];
                const draft = phoneDrafts[r.id] ?? "";
                const isSuggested =
                  suggested &&
                  draft.trim() === suggested.phoneNumber &&
                  !assigned;

                return (
                  <tr key={r.id} className="hover:bg-bg/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-navy">
                        {r.userName || "—"}
                      </p>
                      <p className="text-caption text-text-muted">
                        {r.userEmail || r.userId}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{requestTypeLabel(r.type)}</p>
                      {r.type === "support" &&
                        typeof r.payload.message === "string" && (
                          <p className="mt-1 line-clamp-2 text-caption text-text-muted">
                            {r.payload.message}
                          </p>
                        )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusBadgeVariant(r.status)}>
                        {STATUS_LABELS[r.status]}
                      </Badge>
                      {assigned && (
                        <p className="mt-1 font-mono text-caption text-text-muted">
                          {assigned}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-caption text-text-muted">
                      {new Date(r.createdAt).toLocaleString("de-CH")}
                    </td>
                    <td className="px-4 py-3">
                      {isPhone ? (
                        r.status === "erledigt" && assigned ? (
                          <p className="font-mono text-caption text-navy">
                            {assigned}
                          </p>
                        ) : r.status === "abgelehnt" ? (
                          <span className="text-caption text-text-muted">—</span>
                        ) : (
                          <div className="flex min-w-[280px] flex-col gap-2 sm:flex-row sm:items-center">
                            <div className="min-w-0 flex-1">
                              <Input
                                className="font-mono text-caption"
                                placeholder={
                                  suggested
                                    ? suggested.phoneNumber
                                    : "+41445054632"
                                }
                                value={draft}
                                onChange={(e) =>
                                  setPhoneDrafts((prev) => ({
                                    ...prev,
                                    [r.id]: e.target.value,
                                  }))
                                }
                                disabled={acting === r.id}
                              />
                              {isSuggested && (
                                <p className="mt-1 flex items-center gap-1 text-caption text-accent">
                                  <Sparkles className="h-3 w-3" />
                                  Vorgeschlagen
                                </p>
                              )}
                              {!suggested &&
                                (r.status === "offen" ||
                                  r.status === "in_arbeit") && (
                                  <p className="mt-1 text-caption text-text-muted">
                                    Keine freie Nummer verfügbar
                                  </p>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                disabled={
                                  acting === r.id || !draft.trim()
                                }
                                onClick={() => assignPhoneNumber(r.id)}
                              >
                                {acting === r.id ? "…" : "Bestätigen"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={acting === r.id}
                                onClick={() => rejectRequest(r.id)}
                              >
                                Ablehnen
                              </Button>
                              <Button asChild variant="ghost" size="sm">
                                <Link href={`/admin/requests/${r.id}`}>
                                  Details
                                </Link>
                              </Button>
                            </div>
                          </div>
                        )
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/admin/requests/${r.id}`}>
                              Bearbeiten
                            </Link>
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
