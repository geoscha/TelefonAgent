"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  Phone,
  Bot,
  Settings,
  CalendarPlus,
  PhoneForwarded,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { mockCalls } from "@/lib/mock/calls";

const OPEN_EVENT = "cura:open-command";

/** Dispatch from anywhere to open the palette: window.dispatchEvent(new Event("cura:open-command")) */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const navItems = [
  { href: "/", label: "Anrufe", icon: Phone },
  { href: "/telefonagent", label: "Telefonagent", icon: Bot },
  { href: "/einstellungen", label: "Profil", icon: Settings },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function runAction(label: string, href: string) {
    setOpen(false);
    router.push(href);
    toast.success(label, { description: "Aktion gestartet." });
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Befehlspalette"
      className="fixed inset-0 z-[100]"
    >
      <div
        className="fixed inset-0 bg-navy/20 backdrop-blur-[2px]"
        onClick={() => setOpen(false)}
      />
      <div className="fixed left-1/2 top-[18%] z-[101] w-full max-w-[560px] -translate-x-1/2 px-4">
        <div className="overflow-hidden rounded-card border border-stroke bg-surface shadow-[0_16px_48px_rgba(20,36,46,0.18)]">
          <div className="flex items-center gap-3 border-b border-divider px-4">
            <Search className="h-4 w-4 shrink-0 stroke-[1.5] text-text-muted" />
            <Command.Input
              autoFocus
              placeholder="Suchen oder Befehl eingeben…"
              className="h-12 w-full bg-transparent text-body text-text placeholder:text-text-muted focus:outline-none"
            />
            <kbd className="hidden rounded-[5px] border border-stroke px-1.5 py-0.5 text-[11px] text-text-muted sm:block">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[340px] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-8 text-center text-caption text-text-muted">
              Keine Ergebnisse gefunden.
            </Command.Empty>

            <Command.Group
              heading="Navigation"
              className="px-2 py-1.5 text-caption font-medium uppercase tracking-[0.02em] text-text-muted [&_[cmdk-group-items]]:mt-1 [&_[cmdk-group-items]]:space-y-0.5"
            >
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Command.Item
                    key={item.href}
                    value={`nav ${item.label}`}
                    onSelect={() => go(item.href)}
                    className="flex cursor-pointer items-center gap-3 rounded-btn px-3 py-2.5 text-body text-text data-[selected=true]:bg-baby-blue/50"
                  >
                    <Icon className="h-[18px] w-[18px] stroke-[1.5] text-text-muted" />
                    {item.label}
                  </Command.Item>
                );
              })}
            </Command.Group>

            <Command.Group
              heading="Aktionen"
              className="px-2 py-1.5 text-caption font-medium uppercase tracking-[0.02em] text-text-muted [&_[cmdk-group-items]]:mt-1 [&_[cmdk-group-items]]:space-y-0.5"
            >
              <Command.Item
                value="aktion kalendereintrag erstellen"
                onSelect={() => runAction("Kalendereintrag erstellen", "/anrufe")}
                className="flex cursor-pointer items-center gap-3 rounded-btn px-3 py-2.5 text-body text-text data-[selected=true]:bg-baby-blue/50"
              >
                <CalendarPlus className="h-[18px] w-[18px] stroke-[1.5] text-text-muted" />
                Kalendereintrag erstellen
              </Command.Item>
              <Command.Item
                value="aktion rückruf planen"
                onSelect={() => runAction("Rückruf planen", "/anrufe")}
                className="flex cursor-pointer items-center gap-3 rounded-btn px-3 py-2.5 text-body text-text data-[selected=true]:bg-baby-blue/50"
              >
                <PhoneForwarded className="h-[18px] w-[18px] stroke-[1.5] text-text-muted" />
                Rückruf planen
              </Command.Item>
            </Command.Group>

            <Command.Group
              heading="Anrufe"
              className="px-2 py-1.5 text-caption font-medium uppercase tracking-[0.02em] text-text-muted [&_[cmdk-group-items]]:mt-1 [&_[cmdk-group-items]]:space-y-0.5"
            >
              {mockCalls.map((call) => (
                <Command.Item
                  key={call.id}
                  value={`anruf ${call.callerName ?? call.callerPhone} ${call.property} ${call.category}`}
                  onSelect={() => go(`/anrufe/${call.id}`)}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-btn px-3 py-2.5 text-body text-text data-[selected=true]:bg-baby-blue/50"
                >
                  <span className="flex items-center gap-3">
                    <Phone className="h-[18px] w-[18px] stroke-[1.5] text-text-muted" />
                    {call.callerName ?? call.callerPhone}
                  </span>
                  <span className="truncate text-caption text-text-muted">
                    {call.property}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </div>
      </div>
    </Command.Dialog>
  );
}
