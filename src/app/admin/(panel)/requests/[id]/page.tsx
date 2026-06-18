"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export default function AdminRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [request, setRequest] = useState<UserRequest | null>(null);
  const [status, setStatus] = useState<RequestStatus>("offen");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [elevenLabsId, setElevenLabsId] = useState("");
  const [forwardingInstructions, setForwardingInstructions] = useState("");
  const [suggested, setSuggested] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/requests/${id}`);
      const data = await res.json();
      if (res.ok && data.ok) {
        const req = data.request as UserRequest;
        setRequest(req);
        setStatus(req.status);
        const payload = req.payload ?? {};
        const suggestion = data.suggestion as PhoneSuggestion | null;

        if (typeof payload.phoneNumber === "string") {
          setPhoneNumber(payload.phoneNumber);
        } else if (suggestion?.phoneNumber) {
          setPhoneNumber(suggestion.phoneNumber);
          setSuggested(true);
        }

        if (typeof payload.elevenLabsPhoneNumberId === "string") {
          setElevenLabsId(payload.elevenLabsPhoneNumberId);
        } else if (suggestion?.elevenLabsPhoneNumberId) {
          setElevenLabsId(suggestion.elevenLabsPhoneNumberId);
        }
        if (typeof payload.forwardingInstructions === "string") {
          setForwardingInstructions(payload.forwardingInstructions);
        }
      } else {
        toast.error("Anfrage nicht gefunden.");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(patch: {
    status?: RequestStatus;
    assignPhone?: {
      phoneNumber: string;
      elevenLabsPhoneNumberId?: string;
      forwardingInstructions?: string;
    };
  }) {
    if (!request) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setRequest(data.request as UserRequest);
        setStatus((data.request as UserRequest).status);
        toast.success(
          patch.assignPhone
            ? "Nummer zugewiesen — Anfrage bestätigt."
            : "Gespeichert."
        );
      } else {
        toast.error(data.error ?? "Speichern fehlgeschlagen.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function assignNumber() {
    if (!phoneNumber.trim()) {
      toast.error("Bitte die Twilio-Nummer eingeben (z. B. +41445054632).");
      return;
    }
    await save({
      assignPhone: {
        phoneNumber: phoneNumber.trim(),
        elevenLabsPhoneNumberId: elevenLabsId.trim() || undefined,
        forwardingInstructions: forwardingInstructions.trim() || undefined,
      },
    });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-20 text-text-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
        Laden…
      </div>
    );
  }

  if (!request) {
    return (
      <div className="space-y-4 py-12">
        <p className="text-body text-text-muted">Anfrage nicht gefunden.</p>
        <Button asChild variant="outline">
          <Link href="/admin">Zurück</Link>
        </Button>
      </div>
    );
  }

  const isPhone = isPhoneNumberRequest(request.type);
  const assigned =
    typeof request.payload.phoneNumber === "string"
      ? request.payload.phoneNumber
      : null;
  const isConfirmed = request.status === "erledigt" && assigned;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurück
        </Link>
      </Button>

      <div>
        <h1>Anfrage bearbeiten</h1>
        <p className="mt-1 text-caption text-text-muted">ID: {request.id}</p>
      </div>

      {isPhone && !isConfirmed && (
        <div className="space-y-4 rounded-card border-2 border-accent/30 bg-surface p-6">
          <div>
            <h2 className="text-h3 text-navy">Twilio-Nummer zuweisen & bestätigen</h2>
            <p className="mt-1 text-body text-text-muted">
              Geben Sie die individuelle Twilio-Nummer für{" "}
              <strong>{request.userName || request.userEmail}</strong> ein.
              Erst damit wird die Anfrage bestätigt — der User sieht genau
              diese Nummer zur Weiterleitung.
            </p>
            {suggested && (
              <p className="mt-2 text-caption text-accent">
                Nächste freie Nummer wurde automatisch vorgeschlagen.
              </p>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="phone">
                Twilio-Nummer <span className="text-red-600">*</span>
              </Label>
              <Input
                id="phone"
                className="font-mono"
                placeholder="+41445054632"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="el-id">ElevenLabs Phone ID (optional)</Label>
              <Input
                id="el-id"
                placeholder="phnum_…"
                value={elevenLabsId}
                onChange={(e) => setElevenLabsId(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="instructions">
              Weiterleitungs-Anleitung (optional)
            </Label>
            <textarea
              id="instructions"
              className="flex min-h-[120px] w-full rounded-btn border border-stroke bg-surface px-3 py-2 text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              placeholder="Schritt-für-Schritt-Anleitung für den User…"
              value={forwardingInstructions}
              onChange={(e) => setForwardingInstructions(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={assignNumber} disabled={saving || !phoneNumber.trim()}>
              {saving ? "Wird zugewiesen…" : "Bestätigen & Nummer zuweisen"}
            </Button>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => save({ status: "abgelehnt" })}
            >
              Ablehnen
            </Button>
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => save({ status: "in_arbeit" })}
            >
              Als «In Arbeit» markieren
            </Button>
          </div>
        </div>
      )}

      {isPhone && isConfirmed && (
        <div className="rounded-card border border-stroke bg-bg/50 p-6">
          <p className="text-caption font-medium text-text-muted">
            Zugewiesene Twilio-Nummer
          </p>
          <p className="mt-1 font-mono text-h3 text-navy">{assigned}</p>
          <p className="mt-2 text-body text-text-muted">
            Anfrage bestätigt am{" "}
            {request.payload.assignedAt
              ? new Date(String(request.payload.assignedAt)).toLocaleString(
                  "de-CH"
                )
              : new Date(request.updatedAt).toLocaleString("de-CH")}
          </p>
        </div>
      )}

      <div className="grid gap-6 rounded-card border border-stroke bg-surface p-6 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <p className="text-caption font-medium text-text-muted">User</p>
            <p className="font-medium text-navy">{request.userName || "—"}</p>
            <p className="text-body text-text-muted">{request.userEmail}</p>
          </div>
          <div>
            <p className="text-caption font-medium text-text-muted">Typ</p>
            <p className="text-body">{requestTypeLabel(request.type)}</p>
          </div>
          <div>
            <p className="text-caption font-medium text-text-muted">Erstellt</p>
            <p className="text-body">
              {new Date(request.createdAt).toLocaleString("de-CH")}
            </p>
          </div>
        </div>

        {!isPhone && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as RequestStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABELS) as RequestStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => save({ status })} disabled={saving}>
                {saving ? "Speichern…" : "Status speichern"}
              </Button>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => save({ status: "abgelehnt" })}
              >
                Ablehnen
              </Button>
            </div>
          </div>
        )}

        {isPhone && (
          <div className="space-y-2">
            <p className="text-caption font-medium text-text-muted">Status</p>
            <Badge>{STATUS_LABELS[request.status]}</Badge>
            {!isConfirmed && (
              <p className="text-caption text-text-muted">
                Wird automatisch auf «Erledigt» gesetzt, sobald Sie eine
                Twilio-Nummer zuweisen.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="rounded-card border border-stroke bg-surface p-6">
        <p className="mb-3 text-caption font-medium text-text-muted">
          Details (Payload)
        </p>
        <pre className="overflow-x-auto rounded-btn bg-bg p-4 text-caption text-text">
          {JSON.stringify(request.payload, null, 2)}
        </pre>
      </div>
    </div>
  );
}
