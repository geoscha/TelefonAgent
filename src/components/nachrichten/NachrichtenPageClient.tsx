"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { MessageChannelPanel } from "@/components/nachrichten/MessageChannelPanel";
import { MessageChannelSidebar } from "@/components/nachrichten/MessageChannelSidebar";
import { Skeleton } from "@/components/ui/skeleton";
import type { MessageChannel } from "@/lib/messages/types";

export function NachrichtenPageClient() {
  const [channels, setChannels] = useState<MessageChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    null
  );

  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/messages/channels");
      const data = await res.json();
      if (res.ok && data.ok) {
        setChannels((data.channels ?? []) as MessageChannel[]);
      } else {
        setChannels([]);
      }
    } catch {
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

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
        loading={loading}
        onSelect={setSelectedChannelId}
      />
      {loading && channels.length === 0 ? (
        <Skeleton className="min-h-0 flex-1 self-stretch rounded" />
      ) : (
        <MessageChannelPanel channel={selectedChannel} />
      )}
    </div>
  );
}
