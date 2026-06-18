"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpDown } from "lucide-react";
import { EmptyState } from "@/components/brand/EmptyState";
import { CategoryBadge } from "@/components/dashboard/CallCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Call, CallCategory, CallStatus } from "@/lib/types";
import { formatDateTime, formatDuration } from "@/lib/utils";

const statusLabel: Record<CallStatus, string> = {
  offen: "Offen",
  erledigt: "Erledigt",
  eskaliert: "Eskaliert",
};

export function AnrufeList({ calls }: { calls: Call[] }) {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortDesc, setSortDesc] = useState(true);

  const filteredCalls = useMemo(() => {
    let list = [...calls];
    if (categoryFilter !== "all") {
      list = list.filter((c) => c.category === categoryFilter);
    }
    if (statusFilter !== "all") {
      list = list.filter((c) => c.status === statusFilter);
    }
    list.sort((a, b) => {
      const diff =
        new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
      return sortDesc ? -diff : diff;
    });
    return list;
  }, [calls, categoryFilter, statusFilter, sortDesc]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Kategorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Kategorien</SelectItem>
            <SelectItem value="Schadenmeldung">Schadenmeldung</SelectItem>
            <SelectItem value="Mietzins">Mietzins</SelectItem>
            <SelectItem value="Besichtigung">Besichtigung</SelectItem>
            <SelectItem value="Allgemein">Allgemein</SelectItem>
            <SelectItem value="Notfall">Notfall</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            <SelectItem value="offen">Offen</SelectItem>
            <SelectItem value="erledigt">Erledigt</SelectItem>
            <SelectItem value="eskaliert">Eskaliert</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setSortDesc(!sortDesc)}
        >
          <ArrowUpDown className="h-4 w-4" />
          Datum {sortDesc ? "↓" : "↑"}
        </Button>
      </div>

      {filteredCalls.length === 0 ? (
        <div className="overflow-hidden rounded-card border border-stroke bg-surface">
          <EmptyState
            illustration="calls"
            title={calls.length === 0 ? "Noch keine Anrufe" : "Keine Anrufe gefunden"}
            description={
              calls.length === 0
                ? "Sobald Ihr Telefonagent Anrufe entgegennimmt, erscheinen sie hier."
                : "Passen Sie die Filter an."
            }
            gradient="cool"
          />
        </div>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-divider">
                    <th className="label-caps px-6 py-4 text-left">Datum</th>
                    <th className="label-caps px-6 py-4 text-left">Anrufer</th>
                    <th className="label-caps px-6 py-4 text-left">Objekt</th>
                    <th className="label-caps px-6 py-4 text-left">Kategorie</th>
                    <th className="label-caps px-6 py-4 text-left">Status</th>
                    <th className="label-caps px-6 py-4 text-left">Dauer</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCalls.map((call) => (
                    <tr
                      key={call.id}
                      className="border-b border-divider last:border-0 transition-colors hover:bg-baby-blue/20"
                    >
                      <td className="whitespace-nowrap px-6 py-4">
                        <Link
                          href={`/anrufe/${call.id}`}
                          className="hover:text-accent"
                        >
                          {formatDateTime(call.startedAt)}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          href={`/anrufe/${call.id}`}
                          className="font-medium hover:text-accent"
                        >
                          {call.callerName ?? call.callerPhone}
                        </Link>
                      </td>
                      <td className="max-w-[200px] truncate px-6 py-4 text-text-muted">
                        {call.property}
                      </td>
                      <td className="px-6 py-4">
                        <CategoryBadge category={call.category as CallCategory} />
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          variant={
                            call.status === "erledigt"
                              ? "success"
                              : call.status === "eskaliert"
                                ? "notfall"
                                : "warning"
                          }
                        >
                          {statusLabel[call.status]}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-text-muted">
                        {formatDuration(call.durationSeconds)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
