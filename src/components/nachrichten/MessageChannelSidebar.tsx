"use client";

import Image from "next/image";

import { landingPanelClass } from "@/components/landing/landing-buttons";
import { INTEGRATION_LOGOS } from "@/lib/integrations/integration-logos";
import type { MessageChannel } from "@/lib/messages/types";
import { cn } from "@/lib/utils";

const CHANNEL_LOGOS: Partial<
  Record<MessageChannel["type"], { src: string; width: number; height: number }>
> = {
  gmail: INTEGRATION_LOGOS.gmail,
  outlook: INTEGRATION_LOGOS.outlook,
  apple_mail: INTEGRATION_LOGOS.appleMail,
  whatsapp: INTEGRATION_LOGOS.whatsapp,
};

interface MessageChannelSidebarProps {
  channels: MessageChannel[];
  selectedChannelId?: string | null;
  loading?: boolean;
  onSelect: (channelId: string) => void;
}

export function MessageChannelSidebar({
  channels,
  selectedChannelId,
  loading = false,
  onSelect,
}: MessageChannelSidebarProps) {
  return (
    <div className="flex w-[200px] shrink-0 flex-col gap-2 self-stretch lg:w-[220px]">
      <div
        className={cn(
          landingPanelClass,
          "flex min-h-0 flex-1 flex-col overflow-hidden"
        )}
      >
        {loading ? (
          <p className="landing-body px-3 py-6 text-center text-[#99A0AE]">
            Lädt…
          </p>
        ) : channels.length > 0 ? (
          <ul className="divide-y divide-[#E1E4EA]">
            {channels.map((channel) => {
              const selected = selectedChannelId === channel.id;
              const logo = CHANNEL_LOGOS[channel.type];

              return (
                <li key={channel.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(channel.id)}
                    className={cn(
                      "landing-body flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors",
                      selected
                        ? "bg-[#F5F7FA] text-[#0E121B]"
                        : "text-[#525866] hover:bg-[#F5F7FA] hover:text-[#0E121B]"
                    )}
                  >
                    {logo ? (
                      <div className="mt-0.5 flex h-5 w-5 shrink-0 overflow-hidden rounded bg-white">
                        <Image
                          src={logo.src}
                          alt=""
                          width={logo.width}
                          height={logo.height}
                          unoptimized
                          className="h-full w-full object-contain"
                          aria-hidden
                        />
                      </div>
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-medium">
                          {channel.label}
                        </span>
                        {channel.unreadCount > 0 ? (
                          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#335cff] px-1 text-[10px] font-medium text-white">
                            {channel.unreadCount > 9 ? "9+" : channel.unreadCount}
                          </span>
                        ) : null}
                      </span>
                      {channel.subtitle ? (
                        <span className="mt-0.5 block truncate text-[11px] text-[#99A0AE]">
                          {channel.subtitle}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
