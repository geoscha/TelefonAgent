"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calendar, CheckCircle2, Loader2, Mail, MessageCircle, RefreshCw, Sparkles, Wrench } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/brand/EmptyState";
import { landingBtnPrimary, landingBtnSecondary } from "@/components/landing/landing-buttons";
import { Skeleton } from "@/components/ui/skeleton";
import {
  userLabelClass,
  userPanelClass,
  userTitleClass,
} from "@/components/user/user-styles";
import { CACHE_KEYS, writeStaleCache } from "@/lib/client/stale-cache";
import { useStaleFetch } from "@/lib/hooks/useStaleFetch";
import type {
  CraftsmanEmailDraft,
  CustomerDossier,
  InquiryQuickAction,
  MatchedCustomer,
  MessageInquiry,
  MessageInquiryListItem,
  MessageInquiryUrgency,
  MessageSuggestedAction,
} from "@/lib/messages/inquiry-types";
import type { InboundMessage, MessageChannel } from "@/lib/messages/types";
import { parseChannelId } from "@/lib/messages/types";
import { cn, formatDateTime } from "@/lib/utils";
import { resolveInquiryWorkflowLabel } from "@/lib/messages/inquiry-workflow-label";

function WorkflowLabel({ label }: { label: string }) {
  const unclear = label === "unklar";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        unclear
          ? "border-[#E1E4EA] bg-[#FAFAFA] text-[#99A0AE]"
          : "border-[#335cff]/20 bg-[#F0F4FF] text-[#335cff]"
      )}
    >
      {label}
    </span>
  );
}

interface MessageChannelPanelProps {
  channel: MessageChannel | null;
  onInquiriesChanged?: () => void;
}

const URGENCY_META: Record<
  MessageInquiryUrgency,
  { label: string; dot: string; chip: string }
> = {
  hoch: {
    label: "Dringend",
    dot: "bg-[#FB3748]",
    chip: "border-[#FB3748]/20 bg-[#FFF0F1] text-[#D5293A]",
  },
  mittel: {
    label: "Mittel",
    dot: "bg-[#FF8447]",
    chip: "border-[#FF8447]/20 bg-[#FFF4EC] text-[#C4631F]",
  },
  niedrig: {
    label: "Niedrig",
    dot: "bg-[#1FC16B]",
    chip: "border-[#1FC16B]/20 bg-[#EFFAF3] text-[#1A7F4B]",
  },
};

function UrgencyDot({ urgency }: { urgency?: MessageInquiryUrgency }) {
  if (!urgency) return null;
  const meta = URGENCY_META[urgency];
  return (
    <span
      className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)}
      title={`Dringlichkeit: ${meta.label}`}
    />
  );
}

function MetaChips({
  category,
  urgency,
  confidence,
}: {
  category?: string;
  urgency?: MessageInquiryUrgency;
  confidence?: number;
}) {
  if (!category && !urgency && confidence === undefined) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {category ? (
        <span className="rounded-full border border-[#E1E4EA] bg-white px-2 py-0.5 text-[11px] font-medium text-[#525866]">
          {category}
        </span>
      ) : null}
      {urgency ? (
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px] font-medium",
            URGENCY_META[urgency].chip
          )}
        >
          {URGENCY_META[urgency].label}
        </span>
      ) : null}
      {confidence !== undefined ? (
        <span
          className="rounded-full border border-[#E1E4EA] bg-white px-2 py-0.5 text-[11px] text-[#99A0AE]"
          title="KI-Konfidenz"
        >
          {Math.round(confidence * 100)}% sicher
        </span>
      ) : null}
    </div>
  );
}

function formatDossierDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("de-CH", {
      timeZone: "Europe/Zurich",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

async function fetchInquiries(channel: MessageChannel): Promise<MessageInquiryListItem[]> {
  const parsed = parseChannelId(channel.id);
  if (!parsed) return [];
  const params = new URLSearchParams({
    channelType: parsed.type,
    channelRef: parsed.ref,
  });
  const res = await fetch(`/api/messages/inquiries?${params.toString()}`);
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error("inquiries load failed");
  return (data.inquiries ?? []) as MessageInquiryListItem[];
}

export function MessageChannelPanel({
  channel,
  onInquiriesChanged,
}: MessageChannelPanelProps) {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const inquiriesKey = channel
    ? CACHE_KEYS.messagesInquiries(channel.id)
    : "messages-inquiries:none";

  const fetchForChannel = useCallback(async () => {
    if (!channel) return [];
    return fetchInquiries(channel);
  }, [channel]);

  const {
    data: inquiriesData,
    loading,
    revalidating,
    revalidate,
  } = useStaleFetch<MessageInquiryListItem[]>(
    inquiriesKey,
    fetchForChannel,
    { ttlMs: 45_000, revalidate: Boolean(channel) }
  );

  const inquiries = channel ? (inquiriesData ?? []) : [];

  const syncNow = useCallback(async () => {
    if (!channel) return;
    const parsed = parseChannelId(channel.id);
    if (!parsed) return;

    setSyncing(true);
    try {
      const res = await fetch("/api/messages/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelType: parsed.type,
          channelRef: parsed.ref,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        toast.error("Synchronisation fehlgeschlagen", {
          description: data.error ?? "Bitte erneut versuchen.",
        });
        return;
      }

      const nextInquiries = (data.inquiries ?? []) as MessageInquiryListItem[];
      writeStaleCache(inquiriesKey, nextInquiries);

      if (typeof data.imported === "number" && data.imported > 0) {
        toast.success(`${data.imported} neue Nachricht(en) importiert`);
      } else if (typeof data.removed === "number" && data.removed > 0) {
        toast.success(`${data.removed} Unterhaltung(en) entfernt`);
      }

      onInquiriesChanged?.();
    } catch {
      toast.error("Synchronisation fehlgeschlagen");
    } finally {
      setSyncing(false);
    }
  }, [channel, inquiriesKey, onInquiriesChanged]);

  useEffect(() => {
    setSelectedThreadId(null);
  }, [channel?.id]);

  if (!channel) {
    return (
      <div className="landing-panel flex min-h-0 flex-1 items-center justify-center self-stretch border border-dashed border-[#E1E4EA] p-8">
        <p className="landing-body text-[#99A0AE]">
          Dienst auswählen, um bearbeitbare Anfragen anzuzeigen
        </p>
      </div>
    );
  }

  if (selectedThreadId) {
    return (
      <MessageInquiryDetail
        threadId={selectedThreadId}
        onBack={() => {
          setSelectedThreadId(null);
          void revalidate();
          onInquiriesChanged?.();
        }}
      />
    );
  }

  const showSkeleton = loading && inquiries.length === 0 && !inquiriesData;

  return (
    <div
      className={cn(
        userPanelClass,
        "flex min-h-0 min-w-0 flex-1 flex-col self-stretch"
      )}
    >
      <div className="shrink-0 border-b border-[#E1E4EA] px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#335cff]" />
            <div className="min-w-0">
              <p className={userTitleClass}>Offene Unterhaltungen</p>
              <p className={`${userLabelClass} mt-1`}>
                {channel.label}
                {" · "}
                Alle Fälle ohne Antwort an den Kunden. Relevante Anliegen (z. B.
                Schadensmeldung) erhalten einen KI-Vorschlag.
                {revalidating ? " · aktualisiere…" : null}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void syncNow()}
            disabled={syncing || revalidating}
            title="Nachrichten synchronisieren"
            aria-label="Nachrichten synchronisieren"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#E1E4EA] bg-white text-[#525866] transition hover:bg-[#F5F5F5] hover:text-[#0E121B] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              className={cn("h-4 w-4", (syncing || revalidating) && "animate-spin")}
            />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {showSkeleton ? (
          <div className="space-y-0 divide-y divide-[#E1E4EA]">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="px-5 py-4">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="mt-2 h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : inquiries.length > 0 ? (
          <div className="divide-y divide-[#E1E4EA]">
            {inquiries.map((inquiry) => {
              const workflowLabel = resolveInquiryWorkflowLabel({
                matchedWorkflow: inquiry.matchedWorkflow,
                category: inquiry.category,
                text: `${inquiry.title} ${inquiry.preview} ${inquiry.summary ?? ""}`,
              });

              return (
              <button
                key={inquiry.threadId}
                type="button"
                onClick={() => setSelectedThreadId(inquiry.threadId)}
                className={cn(
                  "flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-[#FAFAFA]",
                  inquiry.hasSuggestion && "bg-[#F8FAFF]/60"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <UrgencyDot urgency={inquiry.urgency} />
                    <p className="truncate text-[14px] font-medium text-[#0E121B]">
                      {inquiry.title}
                    </p>
                    <WorkflowLabel label={workflowLabel} />
                    {inquiry.hasSuggestion ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#335cff]/20 bg-[#F0F4FF] px-2 py-0.5 text-[10px] font-medium text-[#335cff]">
                        <Sparkles className="h-3 w-3" />
                        Vorschlag
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 rounded-full border border-[#E1E4EA] bg-white px-2 py-0.5 text-[10px] font-medium text-[#525866]">
                        Offen
                      </span>
                    )}
                    {inquiry.unreadCount > 0 ? (
                      <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[#335cff] px-1 text-[10px] font-medium text-white">
                        {inquiry.unreadCount > 9 ? "9+" : inquiry.unreadCount}
                      </span>
                    ) : null}
                  </div>
                  {inquiry.hasSuggestion && inquiry.summary ? (
                    <p className="mt-1 line-clamp-2 text-[13px] text-[#525866]">
                      {inquiry.summary}
                    </p>
                  ) : (
                    <p className="mt-1 line-clamp-2 text-[13px] text-[#525866]">
                      {inquiry.preview}
                    </p>
                  )}
                  {inquiry.hasSuggestion ? (
                    <MetaChips
                      category={inquiry.category}
                      urgency={inquiry.urgency}
                      confidence={inquiry.confidence}
                    />
                  ) : (
                    <p className="mt-2 text-[11px] text-[#99A0AE]">
                      Antwort ausstehend — noch kein KI-Vorschlag
                    </p>
                  )}
                  {inquiry.hasSuggestion && inquiry.matchedCustomers?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {inquiry.matchedCustomers.slice(0, 2).map((customer) => (
                        <span
                          key={customer.id}
                          className="rounded-full border border-[#335cff]/20 bg-[#F0F4FF] px-2 py-0.5 text-[11px] text-[#335cff]"
                        >
                          {customer.name}
                          {customer.address ? ` · ${customer.address.split(",")[0]}` : ""}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {inquiry.hasSuggestion && inquiry.suggestedActions.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {inquiry.suggestedActions.slice(0, 3).map((action) => (
                        <span
                          key={action.id}
                          className="rounded-full border border-[#E1E4EA] bg-[#FAFAFA] px-2 py-0.5 text-[11px] text-[#525866]"
                        >
                          {action.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <span className="shrink-0 text-[11px] text-[#99A0AE]">
                  {formatDateTime(inquiry.lastMessageAt)}
                </span>
              </button>
              );
            })}
          </div>
        ) : (
          <div className="p-8">
            <EmptyState
              illustration="calls"
              title="Keine offenen Unterhaltungen"
              description="Sobald eine Nachricht ohne Antwort eingeht, erscheint der Thread hier — bis Sie dem Kunden geantwortet haben. Relevante Anliegen wie Schadensmeldungen erhalten zusätzlich einen KI-Vorschlag."
              subtle
            />
          </div>
        )}
      </div>
    </div>
  );
}

function MessageInquiryDetail({
  threadId,
  onBack,
}: {
  threadId: string;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [inquiry, setInquiry] = useState<MessageInquiry | null>(null);
  const [messages, setMessages] = useState<InboundMessage[]>([]);
  const [draftReply, setDraftReply] = useState("");
  const [craftsmanDrafts, setCraftsmanDrafts] = useState<CraftsmanEmailDraft[]>([]);
  const [executing, setExecuting] = useState(false);
  const [executingActionId, setExecutingActionId] = useState<string | null>(null);
  const [quickActions, setQuickActions] = useState<InquiryQuickAction[]>([]);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/messages/inquiries/${encodeURIComponent(threadId)}`
      );
      const data = await res.json();
      if (res.ok && data.ok) {
        setInquiry(data.inquiry as MessageInquiry);
        setMessages((data.messages ?? []) as InboundMessage[]);
        setDraftReply((data.inquiry?.draftReply as string | undefined) ?? "");
        setCraftsmanDrafts(
          (data.inquiry?.craftsmanDrafts as CraftsmanEmailDraft[] | undefined) ?? []
        );
        setQuickActions((data.quickActions as InquiryQuickAction[] | undefined) ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const title = useMemo(() => {
    const latestInbound = [...messages]
      .reverse()
      .find((message) => message.direction === "inbound");
    return (
      latestInbound?.senderLabel ||
      latestInbound?.senderAddress ||
      inquiry?.summary ||
      "Anfrage"
    );
  }, [messages, inquiry?.summary]);

  const hasSuggestion = Boolean(
    inquiry?.actionable &&
      inquiry.status === "open" &&
      ((inquiry.suggestedActions?.length ?? 0) > 0 ||
        inquiry.draftReply ||
        (inquiry.craftsmanDrafts?.length ?? 0) > 0)
  );

  const pendingCraftsmanDrafts = craftsmanDrafts.filter(
    (draft) =>
      draft.status !== "sent" &&
      draft.recipientEmail?.trim() &&
      draft.body?.trim() &&
      draft.subject?.trim()
  );

  const canSend =
    draftReply.trim().length > 0 || pendingCraftsmanDrafts.length > 0;

  function updateCraftsmanDraft(
    draftId: string,
    patch: Partial<Pick<CraftsmanEmailDraft, "recipientEmail" | "subject" | "body">>
  ) {
    setCraftsmanDrafts((current) =>
      current.map((draft) => (draft.id === draftId ? { ...draft, ...patch } : draft))
    );
  }

  async function handleExecute(options?: {
    actionIds?: string[];
    craftsmanDraftIds?: string[];
    sendCustomerReply?: boolean;
    successLabel?: string;
    onComplete?: () => void;
  }) {
    if (!canSend && !options?.actionIds?.length) {
      toast.error("Bitte mindestens einen Entwurf ausfüllen.");
      return;
    }

    setExecuting(true);
    try {
      const res = await fetch(
        `/api/messages/inquiries/${encodeURIComponent(threadId)}/execute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            draftReply: draftReply.trim(),
            craftsmanDrafts,
            actionIds: options?.actionIds,
            craftsmanDraftIds: options?.craftsmanDraftIds,
            sendCustomerReply: options?.sendCustomerReply,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error("Umsetzung fehlgeschlagen", {
          description: data.error ?? "Bitte erneut versuchen.",
        });
        return;
      }

      const errorNotes = (data.errors as string[] | undefined)?.filter(Boolean);
      const sentCraftsmanEmails = data.sentCraftsmanEmails as number | undefined;
      toast.success(options?.successLabel ?? "Anfrage umgesetzt", {
        description:
          errorNotes && errorNotes.length > 0
            ? errorNotes.join(" · ")
            : data.sent || (sentCraftsmanEmails ?? 0) > 0
              ? [
                  data.sent ? "Kundenantwort gesendet" : null,
                  (sentCraftsmanEmails ?? 0) > 0
                    ? `${sentCraftsmanEmails} Handwerker-E-Mail(s) gesendet`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Aktionen ausgeführt."
              : "Aktionen ausgeführt.",
      });

      if (options?.onComplete) {
        options.onComplete();
      } else {
        onBack();
      }
    } catch {
      toast.error("Netzwerkfehler beim Umsetzen.");
    } finally {
      setExecuting(false);
      setExecutingActionId(null);
    }
  }

  async function handleQuickAction(action: InquiryQuickAction) {
    if (action.disabled || action.kind === "info") return;

    setExecutingActionId(action.id);

    if (action.kind === "send_customer_reply") {
      await handleExecute({
        sendCustomerReply: true,
        craftsmanDraftIds: [],
        actionIds: [],
        successLabel: "Antwort gesendet",
        onComplete: () => void loadDetail(),
      });
      return;
    }

    if (action.kind === "send_craftsman_email" && action.craftsmanDraftId) {
      await handleExecute({
        sendCustomerReply: false,
        craftsmanDraftIds: [action.craftsmanDraftId],
        actionIds: [],
        successLabel: "Handwerker-E-Mail gesendet",
        onComplete: () => void loadDetail(),
      });
      return;
    }

    if (action.kind === "run_action" && action.actionId) {
      await handleExecute({
        sendCustomerReply: false,
        actionIds: [action.actionId],
        successLabel: "Aktion ausgeführt",
        onComplete: () => void loadDetail(),
      });
      return;
    }

    if (action.kind === "execute_all") {
      await handleExecute();
    }
  }

  return (
    <div
      className={cn(
        userPanelClass,
        "flex min-h-0 min-w-0 flex-1 flex-col self-stretch"
      )}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-[#E1E4EA] px-5 py-4">
        <button
          type="button"
          onClick={onBack}
          className={cn(landingBtnSecondary, "shrink-0 px-2.5")}
          aria-label="Zurück zur Liste"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className={userTitleClass}>{title}</p>
          {inquiry?.summary ? (
            <p className="truncate text-[12px] text-[#99A0AE]">{inquiry.summary}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <WorkflowLabel
              label={resolveInquiryWorkflowLabel({
                matchedWorkflow: inquiry?.matchedWorkflow,
                category: inquiry?.category,
                text: messages.map((message) => message.body).join(" "),
              })}
            />
            <MetaChips
              category={inquiry?.category}
              urgency={inquiry?.urgency}
              confidence={inquiry?.confidence}
            />
          </div>
        </div>
      </div>

      {loading && !inquiry ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-[#99A0AE]" />
        </div>
      ) : (
        <>
          <div className="shrink-0 space-y-3 border-b border-[#E1E4EA] bg-[#FAFAFA] px-5 py-4 sm:px-6">
            {hasSuggestion && inquiry?.contextSummary ? (
              <div className="rounded-md border border-[#335cff]/15 bg-[#F8FAFF] px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-[#335cff]">
                  <Sparkles className="h-3.5 w-3.5" />
                  Was Linker weiss
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-[#0E121B]">
                  {inquiry.contextSummary}
                </p>
              </div>
            ) : null}

            <div>
              <p className="text-[12px] font-medium uppercase tracking-wide text-[#99A0AE]">
                Antwortentwurf
              </p>
              <textarea
                value={draftReply}
                onChange={(event) => setDraftReply(event.target.value)}
                rows={6}
                className="mt-2 w-full resize-y rounded-md border border-[#E1E4EA] bg-white px-3 py-2.5 text-[13px] leading-relaxed text-[#0E121B] outline-none focus:border-[#335cff]"
                placeholder="Antwort an den Kunden…"
              />
            </div>

            {craftsmanDrafts.length > 0 ? (
              <div>
                <p className="text-[12px] font-medium uppercase tracking-wide text-[#99A0AE]">
                  Handwerker-E-Mail
                </p>
                <div className="mt-2 space-y-3">
                  {craftsmanDrafts.map((draft) => (
                    <div
                      key={draft.id}
                      className="rounded-md border border-[#E1E4EA] bg-white px-3 py-3"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#525866]">
                        <span className="font-medium text-[#0E121B]">
                          {draft.recipientName}
                        </span>
                        {draft.trade ? (
                          <span className="rounded-full border border-[#E1E4EA] px-2 py-0.5">
                            {draft.trade}
                          </span>
                        ) : null}
                        {draft.status === "sent" ? (
                          <span className="rounded-full border border-[#1FC16B]/20 bg-[#EFFAF3] px-2 py-0.5 text-[#1A7F4B]">
                            Gesendet
                          </span>
                        ) : null}
                      </div>
                      <label className="mt-2 block text-[11px] text-[#99A0AE]">
                        Empfänger
                        <input
                          type="email"
                          value={draft.recipientEmail}
                          onChange={(event) =>
                            updateCraftsmanDraft(draft.id, {
                              recipientEmail: event.target.value,
                            })
                          }
                          disabled={draft.status === "sent"}
                          className="mt-1 w-full rounded-md border border-[#E1E4EA] bg-[#FAFAFA] px-2.5 py-2 text-[13px] text-[#0E121B] outline-none focus:border-[#335cff] disabled:opacity-60"
                        />
                      </label>
                      <label className="mt-2 block text-[11px] text-[#99A0AE]">
                        Betreff
                        <input
                          type="text"
                          value={draft.subject}
                          onChange={(event) =>
                            updateCraftsmanDraft(draft.id, { subject: event.target.value })
                          }
                          disabled={draft.status === "sent"}
                          className="mt-1 w-full rounded-md border border-[#E1E4EA] bg-[#FAFAFA] px-2.5 py-2 text-[13px] text-[#0E121B] outline-none focus:border-[#335cff] disabled:opacity-60"
                        />
                      </label>
                      <label className="mt-2 block text-[11px] text-[#99A0AE]">
                        Nachricht
                        <textarea
                          value={draft.body}
                          onChange={(event) =>
                            updateCraftsmanDraft(draft.id, { body: event.target.value })
                          }
                          disabled={draft.status === "sent"}
                          rows={5}
                          className="mt-1 w-full resize-y rounded-md border border-[#E1E4EA] bg-[#FAFAFA] px-2.5 py-2 text-[13px] leading-relaxed text-[#0E121B] outline-none focus:border-[#335cff] disabled:opacity-60"
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {inquiry?.dossiers?.length ? (
              <div>
                <p className="text-[12px] font-medium uppercase tracking-wide text-[#99A0AE]">
                  Kundenkontext
                </p>
                <ul className="mt-2 space-y-2">
                  {inquiry.dossiers.map((dossier) => (
                    <DossierCard key={dossier.id} dossier={dossier} />
                  ))}
                </ul>
              </div>
            ) : inquiry?.matchedCustomers?.length ? (
              <div>
                <p className="text-[12px] font-medium uppercase tracking-wide text-[#99A0AE]">
                  Erkannte Mieter
                </p>
                <ul className="mt-2 space-y-2">
                  {inquiry.matchedCustomers.map((customer) => (
                    <MatchedCustomerRow key={customer.id} customer={customer} />
                  ))}
                </ul>
              </div>
            ) : null}

            {hasSuggestion && inquiry?.suggestedActions?.length ? (
              <div>
                <p className="text-[12px] font-medium uppercase tracking-wide text-[#99A0AE]">
                  Handlungsvorschläge
                </p>
                <ul className="mt-2 space-y-2">
                  {inquiry.suggestedActions.map((action) => (
                    <ActionSuggestionRow
                      key={action.id}
                      action={action}
                      onRun={
                        action.disabledReason
                          ? undefined
                          : () =>
                              void handleQuickAction({
                                id: `run-action-${action.id}`,
                                label: action.label,
                                kind: "run_action",
                                actionId: action.id,
                                integration: action.integration,
                              })
                      }
                      running={executingActionId === `run-action-${action.id}`}
                    />
                  ))}
                </ul>
              </div>
            ) : null}

            {hasSuggestion && quickActions.length > 0 ? (
              <div>
                <p className="text-[12px] font-medium uppercase tracking-wide text-[#99A0AE]">
                  Aktionen
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {quickActions.map((action) => (
                    <QuickActionButton
                      key={action.id}
                      action={action}
                      executing={executing}
                      running={executingActionId === action.id}
                      onClick={() => void handleQuickAction(action)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={executing || !canSend}
                onClick={() => void handleExecute()}
                className={cn(landingBtnPrimary, "w-full justify-center sm:w-auto")}
              >
                {executing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Wird umgesetzt…
                  </>
                ) : hasSuggestion && pendingCraftsmanDrafts.length > 0 ? (
                  "Alles senden & umsetzen"
                ) : hasSuggestion ? (
                  "Senden & umsetzen"
                ) : (
                  "Antwort senden"
                )}
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
            <p className="mb-3 text-[12px] font-medium uppercase tracking-wide text-[#99A0AE]">
              Nachrichtenverlauf
            </p>
            <div className="space-y-3">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DossierCard({ dossier }: { dossier: CustomerDossier }) {
  const upcoming = dossier.appointments.filter((appt) => appt.when === "upcoming");
  const past = dossier.appointments.filter((appt) => appt.when === "past");

  return (
    <li className="rounded-md border border-[#335cff]/20 bg-[#F8FAFF] px-3 py-2.5">
      <p className="text-[13px] font-medium text-[#0E121B]">{dossier.name}</p>
      {dossier.address ? (
        <p className="mt-0.5 text-[12px] text-[#525866]">{dossier.address}</p>
      ) : null}
      <p className="mt-1 text-[11px] text-[#99A0AE]">
        {dossier.phone ? `${dossier.phone} · ` : ""}
        {dossier.propertyLabel ? `${dossier.propertyLabel} · ` : ""}
        {dossier.matchReason}
      </p>

      {upcoming.length > 0 ? (
        <div className="mt-2 border-t border-[#335cff]/10 pt-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#99A0AE]">
            Kommende Termine
          </p>
          <ul className="mt-1 space-y-1">
            {upcoming.map((appt) => (
              <AppointmentLine key={appt.id} appt={appt} />
            ))}
          </ul>
        </div>
      ) : null}

      {past.length > 0 ? (
        <div className="mt-2 border-t border-[#335cff]/10 pt-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#99A0AE]">
            Frühere Termine / Handwerker
          </p>
          <ul className="mt-1 space-y-1">
            {past.slice(0, 4).map((appt) => (
              <AppointmentLine key={appt.id} appt={appt} muted />
            ))}
          </ul>
        </div>
      ) : null}

      {dossier.concerns.length > 0 ? (
        <div className="mt-2 border-t border-[#335cff]/10 pt-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#99A0AE]">
            Frühere Anliegen
          </p>
          <ul className="mt-1 space-y-1">
            {dossier.concerns.slice(0, 4).map((concern) => (
              <li key={concern.threadId} className="text-[12px] text-[#525866]">
                <span className="text-[#99A0AE]">
                  {formatDossierDate(concern.lastMessageAt)} ·{" "}
                </span>
                {concern.subject || concern.summary || "Anliegen"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

function AppointmentLine({
  appt,
  muted,
}: {
  appt: CustomerDossier["appointments"][number];
  muted?: boolean;
}) {
  return (
    <li
      className={cn(
        "text-[12px]",
        muted ? "text-[#99A0AE]" : "text-[#525866]",
        appt.cancelled && "line-through"
      )}
    >
      <span className="text-[#99A0AE]">{formatDossierDate(appt.startIso)} · </span>
      {appt.title}
      {appt.craftsman ? (
        <span className="ml-1 rounded border border-[#E1E4EA] bg-white px-1 py-px text-[10px] text-[#525866]">
          {appt.craftsman}
        </span>
      ) : null}
    </li>
  );
}

function MatchedCustomerRow({ customer }: { customer: MatchedCustomer }) {
  return (
    <li className="rounded-md border border-[#335cff]/20 bg-[#F8FAFF] px-3 py-2.5">
      <p className="text-[13px] font-medium text-[#0E121B]">{customer.name}</p>
      {customer.address ? (
        <p className="mt-0.5 text-[12px] text-[#525866]">{customer.address}</p>
      ) : null}
      <p className="mt-1 text-[11px] text-[#99A0AE]">
        {customer.phone ? `${customer.phone} · ` : ""}
        {customer.matchReason}
      </p>
    </li>
  );
}

function ActionSuggestionRow({
  action,
  onRun,
  running,
}: {
  action: MessageSuggestedAction;
  onRun?: () => void;
  running?: boolean;
}) {
  const integrationLabel =
    action.integration === "calendar"
      ? "Kalendereintrag"
      : action.integration === "craftsman_gmail"
        ? "Handwerker per E-Mail"
        : action.type === "schedule_repair"
          ? "Reparatur koordinieren"
          : action.type === "book_appointment"
            ? "Kalendereintrag anlegen"
            : action.type === "cancel_appointment"
              ? "Termin stornieren"
              : action.type === "reschedule_appointment"
                ? "Termin verschieben"
                : action.type === "contact_craftsman"
                  ? "Handwerker informieren"
                  : "Information";

  return (
    <li className="flex items-start gap-2 rounded-md border border-[#E1E4EA] bg-white px-3 py-2.5">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#335cff]" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-[#0E121B]">{action.label}</p>
        <p className="text-[11px] text-[#99A0AE]">
          {action.disabledReason ?? integrationLabel}
        </p>
      </div>
      {onRun ? (
        <button
          type="button"
          onClick={onRun}
          disabled={running}
          className={cn(
            landingBtnSecondary,
            "shrink-0 px-2.5 py-1 text-[12px]"
          )}
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Ausführen"}
        </button>
      ) : null}
    </li>
  );
}

function QuickActionIcon({
  integration,
}: {
  integration?: InquiryQuickAction["integration"];
}) {
  switch (integration) {
    case "gmail":
    case "craftsman_gmail":
      return <Mail className="h-3.5 w-3.5" />;
    case "whatsapp":
      return <MessageCircle className="h-3.5 w-3.5" />;
    case "calendar":
      return <Calendar className="h-3.5 w-3.5" />;
    default:
      return <Wrench className="h-3.5 w-3.5" />;
  }
}

function QuickActionButton({
  action,
  executing,
  running,
  onClick,
}: {
  action: InquiryQuickAction;
  executing: boolean;
  running: boolean;
  onClick: () => void;
}) {
  if (action.kind === "info") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#335cff]/20 bg-[#F0F4FF] px-3 py-1.5 text-[12px] text-[#335cff]">
        <Sparkles className="h-3.5 w-3.5" />
        {action.label}
      </span>
    );
  }

  const isPrimary = action.primary;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={executing || action.disabled}
      title={action.disabledReason ?? action.description}
      className={cn(
        isPrimary ? landingBtnPrimary : landingBtnSecondary,
        "inline-flex items-center gap-2 px-3 py-2 text-[13px]",
        action.disabled && "cursor-not-allowed opacity-50"
      )}
    >
      {running ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <QuickActionIcon integration={action.integration} />
      )}
      <span className="text-left">
        <span className="block font-medium">{action.label}</span>
        {action.description ? (
          <span className="block text-[11px] opacity-80">{action.description}</span>
        ) : null}
      </span>
    </button>
  );
}

function MessageBubble({ message }: { message: InboundMessage }) {
  const inbound = message.direction === "inbound";

  return (
    <div className={cn("flex", inbound ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg border px-3 py-2.5",
          inbound
            ? "border-[#E1E4EA] bg-[#FAFAFA] text-[#0E121B]"
            : "border-[#335cff]/20 bg-[#F8FAFF] text-[#0E121B]"
        )}
      >
        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[12px] font-medium">
            {message.senderLabel || message.senderAddress || "Unbekannt"}
          </span>
          <span className="text-[11px] text-[#99A0AE]">
            {formatDateTime(message.receivedAt)}
          </span>
        </div>
        {message.subject ? (
          <p className="mb-1 text-[12px] font-medium text-[#525866]">
            {message.subject}
          </p>
        ) : null}
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
          {message.body}
        </p>
      </div>
    </div>
  );
}
