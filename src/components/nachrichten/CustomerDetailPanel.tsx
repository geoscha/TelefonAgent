"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  Calendar,
  Mail,
  MapPin,
  Phone,
  User,
} from "lucide-react";

import { EmptyState } from "@/components/brand/EmptyState";
import { formatSpreadsheetDate } from "@/lib/customers/normalize";
import type { CustomerWithAppointments } from "@/lib/customers/types";
import {
  userLabelClass,
  userPanelClass,
  userTitleClass,
} from "@/components/user/user-styles";
import { cn, formatDateTime } from "@/lib/utils";

interface CustomerDetailPanelProps {
  customer: CustomerWithAppointments | null;
  calendarConnected: boolean;
}

/**
 * Collapse a value that is the same token sequence repeated several times
 * (e.g. an address whose street/zip/city columns all pointed at one cell:
 * "Rosenbergstrasse 12, 9000 St. Gallen" ×3 → shown once).
 */
/** YYYY-MM-DD in Europe/Zurich, used for the calendar deep link. */
function calendarDayParam(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function dedupeRepeatedText(value?: string): string | undefined {
  if (!value) return value;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return undefined;

  const tokens = normalized.split(" ");
  for (let unit = 1; unit <= tokens.length / 2; unit++) {
    if (tokens.length % unit !== 0) continue;
    const candidate = tokens.slice(0, unit).join(" ");
    let repeats = true;
    for (let i = unit; i < tokens.length; i += unit) {
      if (tokens.slice(i, i + unit).join(" ") !== candidate) {
        repeats = false;
        break;
      }
    }
    if (repeats) return candidate;
  }
  return normalized;
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User;
  label: string;
  value?: string;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#99A0AE]" strokeWidth={1.5} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-[#99A0AE]">{label}</p>
        <p className={cn(userLabelClass, "mt-0.5 break-words")}>
          {value?.trim() || "—"}
        </p>
      </div>
    </div>
  );
}

export function CustomerDetailPanel({
  customer,
  calendarConnected,
}: CustomerDetailPanelProps) {
  if (!customer) {
    return (
      <div className="landing-panel flex flex-1 items-center justify-center self-stretch border border-dashed border-[#E1E4EA] p-8">
        <p className="landing-body text-[#99A0AE]">
          Eintrag auswählen, um Details anzuzeigen
        </p>
      </div>
    );
  }

  const isCraftsman = customer.recordType === "craftsman";

  const rentalStart = formatSpreadsheetDate(customer.rentalStart);
  const rentalEnd = formatSpreadsheetDate(customer.rentalEnd);
  const rentalValue =
    customer.rentalInfo ||
    [
      rentalStart ? `ab ${rentalStart}` : null,
      rentalEnd ? `bis ${rentalEnd}` : null,
    ]
      .filter(Boolean)
      .join(" ") ||
    undefined;

  return (
    <div
      className={cn(
        userPanelClass,
        "flex min-h-0 min-w-0 flex-1 flex-col self-stretch"
      )}
    >
      <div className="shrink-0 border-b border-[#E1E4EA] px-5 py-4 sm:px-6">
        <p className={userTitleClass}>{customer.name}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2 sm:px-6">
        <section>
          <h2 className="text-[13px] font-medium text-[#0E121B]">Kontakt</h2>
          <div className="divide-y divide-[#E1E4EA]">
            <DetailRow icon={User} label="Name" value={customer.name} />
            {isCraftsman && customer.trade ? (
              <DetailRow icon={User} label="Gewerk" value={customer.trade} />
            ) : null}
            <DetailRow icon={Phone} label="Telefonnummer" value={customer.phone} />
            <DetailRow icon={Mail} label="E-Mail" value={customer.email} />
            <DetailRow
              icon={MapPin}
              label="Adresse"
              value={dedupeRepeatedText(customer.address)}
            />
            {!isCraftsman && rentalValue ? (
              <DetailRow
                icon={CalendarClock}
                label="Mietdauer"
                value={rentalValue}
              />
            ) : null}
          </div>
        </section>

        {!isCraftsman ? (
        <section className="mt-6 border-t border-[#E1E4EA] pt-5">
          <div className="mb-3 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#99A0AE]" strokeWidth={1.5} />
            <h2 className="text-[13px] font-medium text-[#0E121B]">Termine</h2>
          </div>

          {!calendarConnected ? (
            <div className="rounded border border-[#E1E4EA] bg-[#FAFAFA] px-4 py-3">
              <p className="text-[13px] text-[#525866]">
                Verbinden Sie einen Kalender unter{" "}
                <Link href="/integrationen" className="text-[#335cff] hover:underline">
                  Integrationen
                </Link>
                , um Termine anzuzeigen.
              </p>
            </div>
          ) : customer.appointments.length === 0 ? (
            <EmptyState
              illustration="calls"
              title="Keine Termine für diesen Kunden"
              description="Gebuchte Termine erscheinen hier, sobald sie im Kalender stehen."
              subtle
              className="py-8"
            />
          ) : (
            <ul className="space-y-2">
              {customer.appointments.map((appointment) => (
                <li
                  key={appointment.id}
                  className="rounded border border-[#E1E4EA] bg-[#FAFAFA] px-4 py-3"
                >
                  <p className="text-[13px] font-medium text-[#0E121B]">
                    {appointment.title}
                  </p>
                  <p className="mt-1 text-[12px] text-[#525866]">
                    {formatDateTime(appointment.startIso)}
                  </p>
                  <Link
                    href={`/kalender?event=${encodeURIComponent(
                      appointment.id
                    )}&day=${calendarDayParam(appointment.startIso)}`}
                    className="mt-2 inline-flex items-center gap-1 text-[12px] text-[#335cff] hover:underline"
                  >
                    Im Kalender öffnen
                    <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        ) : null}
      </div>
    </div>
  );
}
