import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarPlus,
  CheckSquare,
  PhoneForwarded,
  AlertTriangle,
} from "lucide-react";
import { CategoryBadge } from "@/components/dashboard/CallCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getFeedCall } from "@/lib/store/calls-feed";
import { formatDateTime, formatDuration } from "@/lib/utils";

export const dynamic = "force-dynamic";

const actionIcons = {
  Kalendereintrag: CalendarPlus,
  Aufgabe: CheckSquare,
  Rückruf: PhoneForwarded,
  Eskalation: AlertTriangle,
};

const statusLabel = {
  offen: "Offen",
  erledigt: "Erledigt",
  eskaliert: "Eskaliert",
};

interface PageProps {
  params: { id: string };
}

export default async function CallDetailPage({ params }: PageProps) {
  const call = await getFeedCall(params.id);
  if (!call) notFound();

  // Mock seed calls use "call-NNN" ids; real ElevenLabs calls use the
  // conversation id and have a server-proxied recording available.
  const isRealCall = !call.id.startsWith("call-");
  const audioSrc = `/api/elevenlabs/conversations/${call.id}/audio`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="flex items-center gap-1 text-body text-text-muted transition-colors hover:text-accent"
        >
          <ArrowLeft className="h-4 w-4 stroke-[1.5]" />
          Zurück zu Anrufen
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{call.callerName ?? call.callerPhone}</h1>
          <p className="mt-1 text-text-muted">{call.property}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <CategoryBadge category={call.category} />
            <Badge variant={call.urgency === "hoch" ? "notfall" : "default"}>
              Dringlichkeit: {call.urgency}
            </Badge>
            <Badge variant={call.status === "erledigt" ? "success" : call.status === "eskaliert" ? "notfall" : "warning"}>
              {statusLabel[call.status]}
            </Badge>
          </div>
        </div>
        <p className="text-body text-text-muted">
          {formatDateTime(call.startedAt)} · {formatDuration(call.durationSeconds)}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Aufnahme</CardTitle>
            </CardHeader>
            <CardContent>
              {isRealCall ? (
                <div className="rounded-btn bg-baby-blue/40 p-4">
                  <audio controls preload="none" className="w-full" src={audioSrc}>
                    Ihr Browser unterstützt keine Audiowiedergabe.
                  </audio>
                  <p className="mt-2 text-caption text-text-muted">
                    Dauer {formatDuration(call.durationSeconds)} · Aufnahme direkt
                    von ElevenLabs.
                  </p>
                </div>
              ) : (
                <div className="rounded-btn bg-baby-blue/40 p-4 text-caption text-text-muted">
                  Beispielanruf — keine echte Aufnahme verfügbar.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Transkript</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {call.transcript.map((line, i) => (
                <div key={i} className="flex gap-3">
                  <span className="w-10 shrink-0 text-caption text-text-muted">{line.timestamp}</span>
                  <div>
                    <p className="text-caption font-medium text-accent">{line.speaker}</p>
                    <p className="text-body text-text">{line.text}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Zusammenfassung</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-body leading-relaxed text-text">{call.summary}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Extrahierte Daten</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-body">
                {call.structuredSummary.tenant && (
                  <div>
                    <dt className="text-text-muted">Mieter</dt>
                    <dd className="font-medium text-text">{call.structuredSummary.tenant}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-text-muted">Objekt</dt>
                  <dd className="font-medium text-text">{call.structuredSummary.property}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Anliegen-Typ</dt>
                  <dd className="font-medium text-text">{call.structuredSummary.concernType}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Dringlichkeit</dt>
                  <dd className="font-medium capitalize text-text">{call.structuredSummary.urgency}</dd>
                </div>
                {call.structuredSummary.notes && (
                  <div>
                    <dt className="text-text-muted">Notizen</dt>
                    <dd className="font-medium text-text">{call.structuredSummary.notes}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          {call.suggestedActions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Vorgeschlagene Aktionen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {call.suggestedActions.map((action) => {
                  const Icon = actionIcons[action.type];
                  return (
                    <div key={action.id} className="flex items-center justify-between gap-2 rounded-btn border border-stroke p-3">
                      <div className="flex items-center gap-2 text-body text-text">
                        <Icon className="h-4 w-4 stroke-[1.5] text-accent" />
                        {action.label}
                      </div>
                      <Badge variant={action.status === "erledigt" ? "success" : action.status === "eskaliert" ? "notfall" : "warning"}>
                        {statusLabel[action.status]}
                      </Badge>
                    </div>
                  );
                })}
                <Separator className="my-3" />
                <Button className="w-full" size="sm">Aktion ausführen</Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
