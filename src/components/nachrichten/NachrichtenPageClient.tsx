"use client";

import { useEffect, useMemo, useState } from "react";

import { MessageChannelPanel } from "@/components/nachrichten/MessageChannelPanel";
import { MessageChannelSidebar } from "@/components/nachrichten/MessageChannelSidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { CACHE_KEYS } from "@/lib/client/stale-cache";
import { useStaleFetch } from "@/lib/hooks/useStaleFetch";
import type { MessageChannel } from "@/lib/messages/types";

async function fetchChannels(): Promise<MessageChannel[]> {
  const res = await fetch("/api/messages/channels");
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error("channels load failed");
  return (data.channels ?? []) as MessageChannel[];
}

export function NachrichtenPageClient() {
  const { data: channelsData, loading, revalidate: revalidateChannels } =
    useStaleFetch<MessageChannel[]>(
    CACHE_KEYS.messagesChannels,
    fetchChannels,
    { ttlMs: 60_000 }
  );
  const channels = channelsData ?? [];
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (channels.length > 0 && !selectedChannelId) {
      setSelectedChannelId(channels[0].id);
    }
    if (
      selectedChannelId &&
      !channels.some((channel) => channel.id === selectedChannelId)
    ) {
      setSelectedChannelId(channels[0]?.id ?? null);
    }
  }, [channels, selectedChannelId]);

  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedChannelId) ?? null,
    [channels, selectedChannelId]
  );

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem-2rem)] gap-3 sm:min-h-[calc(100dvh-3.5rem-2.5rem)] lg:min-h-[calc(100dvh-3.5rem-3rem)]">
      <MessageChannelSidebar
        channels={channels}
        selectedChannelId={selectedChannelId}
        loading={loading && channels.length === 0}
        onSelect={setSelectedChannelId}
      />
      {loading && channels.length === 0 ? (
        <Skeleton className="min-h-0 flex-1 self-stretch rounded" />
      ) : (
        <MessageChannelPanel
          channel={selectedChannel}
          onInquiriesChanged={() => void revalidateChannels()}
        />
      )}
    </div>
  );
}
