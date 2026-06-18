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
import { requestTypeLabel, STATUS_LABELS } from "@/lib/admin/request-types";
import type { OnboardingPhase } from "@/lib/onboarding-types";

interface CustomerDetail {
  profile: {
    id: string;
    name: string;
    email: string;
    plan: "free" | "pro";
    billingInterval?: "monthly" | "yearly";
    createdAt: string;
  };
  settings: {
    curaForwardingNumber?: string;
    onboardingPhase?: OnboardingPhase;
    forwardingStatus?: string;
    forwardingType?: string;
    agentName?: string;
    customerNumber?: string;
    forwardingInstructions?: string;
    connected?: boolean;
  };
  stats: {
    callCount: number;
    totalMinutes: number;
    lastCallAt?: string;
  };
  calls: {
    id: string;
    title: string;
    startedAt: string;
    durationSeconds: number;
    summary: string;
    callerPhone: string;
    status: string;
  }[];
  requests: {
    id: string;
    type: string;
    status: string;
    createdAt: string;
  }[];
}

const ONBOARDING_PHASES: OnboardingPhase[] = [
  "nummer_anfragen",
  "nummer_warte",
  "weiterleitung",
  "agent",
  "fertig",
];

export default function AdminCustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<"free" | "pro">("free");
  const [billingInterval, setBillingInterval] = useState<
    "monthly" | "yearly" | ""
  >("");
  const [onboardingPhase, setOnboardingPhase] =
    useState<OnboardingPhase>("nummer_anfragen");
  const [curaNumber, setCuraNumber] = useState("");
  const [forwardingStatus, setForwardingStatus] = useState("");
  const [forwardingType, setForwardingType] = useState("");
  const [agentName, setAgentName] = useState("");
  const [customerNumber, setCustomerNumber] = useState("");
  const [forwardingInstructions, setForwardingInstructions] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/customers/${id}`);
      const data = await res.json();
      if (res.ok && data.ok) {
        const c = data.customer as CustomerDetail;
        setCustomer(c);
        setName(c.profile.name);
        setEmail(c.profile.email);
        setPlan(c.profile.plan);
        setBillingInterval(c.profile.billingInterval ?? "");
        setOnboardingPhase(c.settings.onboardingPhase ?? "nummer_anfragen");
        setCuraNumber(c.settings.curaForwardingNumber ?? "");
        setForwardingStatus(c.settings.forwardingStatus ?? "");
        setForwardingType(c.settings.forwardingType ?? "");
        setAgentName(c.settings.agentName ?? "");
        setCustomerNumber(c.settings.customerNumber ?? "");
        setForwardingInstructions(c.settings.forwardingInstructions ?? "");
      } else {
        toast.error("Kunde nicht gefunden.");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: {
            name,
            email,
            plan,
            billingInterval: billingInterval || undefined,
          },
          settings: {
            onboardingPhase,
            curaForwardingNumber: curaNumber,
            forwardingStatus: forwardingStatus || undefined,
            forwardingType: forwardingType || undefined,
            agentName,
            customerNumber,
            forwardingInstructions,
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setCustomer(data.customer as CustomerDetail);
        toast.success("Gespeichert.");
      } else {
        toast.error(data.error ?? "Speichern fehlgeschlagen.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-20 text-text-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="space-y-4">
        <p className="text-text-muted">Kunde nicht gefunden.</p>
        <Button asChild variant="outline">
          <Link href="/admin/customers">Zurück</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/customers">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Kunden
        </Link>
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>{customer.profile.name || customer.profile.email}</h1>
        <Button onClick={save} disabled={saving}>
          {saving ? "Speichern…" : "Speichern"}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Anrufe" value={String(customer.stats.callCount)} />
        <Stat
          label="Minuten"
          value={Math.round(customer.stats.totalMinutes).toString()}
        />
        <Stat
          label="Letzter Anruf"
          value={
            customer.stats.lastCallAt
              ? new Date(customer.stats.lastCallAt).toLocaleDateString("de-CH")
              : "—"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-card border border-stroke bg-surface p-5 space-y-4">
          <p className="font-medium text-navy">Profil</p>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="E-Mail">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Plan">
              <Select value={plan} onValueChange={(v) => setPlan(v as "free" | "pro")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Abrechnung">
              <Select
                value={billingInterval || "none"}
                onValueChange={(v) =>
                  setBillingInterval(v === "none" ? "" : (v as "monthly" | "yearly"))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  <SelectItem value="monthly">Monatlich</SelectItem>
                  <SelectItem value="yearly">Jährlich</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <p className="text-caption text-text-muted">
            Registriert {new Date(customer.profile.createdAt).toLocaleString("de-CH")}
          </p>
        </section>

        <section className="rounded-card border border-stroke bg-surface p-5 space-y-4">
          <p className="font-medium text-navy">Telefon & Onboarding</p>
          <Field label="Cura-Nummer">
            <Input
              className="font-mono"
              value={curaNumber}
              onChange={(e) => setCuraNumber(e.target.value)}
            />
          </Field>
          <Field label="Geschäftsnummer">
            <Input
              className="font-mono"
              value={customerNumber}
              onChange={(e) => setCustomerNumber(e.target.value)}
            />
          </Field>
          <Field label="Onboarding-Phase">
            <Select
              value={onboardingPhase}
              onValueChange={(v) => setOnboardingPhase(v as OnboardingPhase)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ONBOARDING_PHASES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Weiterleitung">
              <Select
                value={forwardingStatus || "none"}
                onValueChange={(v) =>
                  setForwardingStatus(v === "none" ? "" : v)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  <SelectItem value="nicht_eingerichtet">Nicht eingerichtet</SelectItem>
                  <SelectItem value="anleitung">Anleitung</SelectItem>
                  <SelectItem value="aktiv">Aktiv</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Typ">
              <Select
                value={forwardingType || "none"}
                onValueChange={(v) => setForwardingType(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  <SelectItem value="bedingt">Überlauf</SelectItem>
                  <SelectItem value="alle">Alle Anrufe</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Agent-Name">
            <Input value={agentName} onChange={(e) => setAgentName(e.target.value)} />
          </Field>
          <Field label="Weiterleitungs-Anleitung">
            <textarea
              className="flex min-h-[80px] w-full rounded-btn border border-stroke bg-surface px-3 py-2 text-body"
              value={forwardingInstructions}
              onChange={(e) => setForwardingInstructions(e.target.value)}
            />
          </Field>
        </section>
      </div>

      <section className="rounded-card border border-stroke bg-surface p-5">
        <p className="mb-4 font-medium text-navy">Anrufe</p>
        {customer.calls.length === 0 ? (
          <p className="text-caption text-text-muted">Keine Anrufe.</p>
        ) : (
          <div className="divide-y divide-stroke">
            {customer.calls.map((call) => (
              <div key={call.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-navy">{call.title || "Anruf"}</p>
                  <p className="text-caption text-text-muted">
                    {new Date(call.startedAt).toLocaleString("de-CH")} ·{" "}
                    {Math.round(call.durationSeconds / 60)} Min.
                  </p>
                </div>
                <p className="mt-1 text-caption text-text-muted">
                  {call.callerPhone} · {call.status}
                </p>
                {call.summary && (
                  <p className="mt-1 text-body text-text-muted">{call.summary}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {customer.requests.length > 0 && (
        <section className="rounded-card border border-stroke bg-surface p-5">
          <p className="mb-4 font-medium text-navy">Anfragen</p>
          <div className="divide-y divide-stroke">
            {customer.requests.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
              >
                <p className="text-body">{requestTypeLabel(r.type)}</p>
                <div className="flex items-center gap-2">
                  <Badge>{STATUS_LABELS[r.status as keyof typeof STATUS_LABELS] ?? r.status}</Badge>
                  <span className="text-caption text-text-muted">
                    {new Date(r.createdAt).toLocaleDateString("de-CH")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-stroke bg-surface px-4 py-3">
      <p className="text-caption text-text-muted">{label}</p>
      <p className="mt-1 font-semibold text-navy">{value}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-caption text-text-muted">{label}</Label>
      {children}
    </div>
  );
}
