"use client";

import Link from "next/link";
import { CalendarClock, Calendar, Mail, MapPin, Phone, User } from "lucide-react";

import { EmptyState } from "@/components/brand/EmptyState";
import { INTEGRATION_LOGOS } from "@/lib/integrations/integration-logos";
import {
  PROPERTY_SOFTWARE_PROVIDER_META,
  type PropertySoftwareProviderId,
} from "@/lib/integrations/property-software/provider-meta";
import type { CustomerWithAppointments } from "@/lib/customers/types";
import {
  userLabelClass,
  userPanelClass,
  userTitleClass,
} from "@/components/user/user-styles";
import { cn, formatDateTime } from "@/lib/utils";

const PROVIDER_LOGOS: Partial<
  Record<PropertySoftwareProviderId, (typeof INTEGRATION_LOGOS)[keyof typeof INTEGRATION_LOGOS]>
> = {
  immotop2: INTEGRATION_LOGOS.immotop2,
  rimo_r5: INTEGRATION_LOGOS.rimoR5,
  garaio_rem: INTEGRATION_LOGOS.garaioRem,
  fairwalter: INTEGRATION_LOGOS.fairwalter,
  excel: INTEGRATION_LOGOS.excel,
};

interface CustomerDetailPanelProps {
  customer: CustomerWithAppointments | null;
  calendarConnected: boolean;
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
          Kunden auswählen, um Details und Termine anzuzeigen
        </p>
      </div>
    );
  }

  const providerMeta = PROPERTY_SOFTWARE_PROVIDER_META[customer.provider];
  const logo = PROVIDER_LOGOS[customer.provider];

  const rentalValue =
    customer.rentalInfo ||
    [
      customer.rentalStart ? `ab ${customer.rentalStart}` : null,
      customer.rentalEnd ? `bis ${customer.rentalEnd}` : null,
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
        <div className="flex items-start gap-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo.src}
              alt=""
              width={32}
              height={32}
              className="mt-0.5 h-8 w-8 shrink-0 rounded object-contain"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className={userTitleClass}>{customer.name}</p>
            <p className={`${userLabelClass} mt-1`}>
              Importiert aus {providerMeta.name}
              {customer.propertyLabel ? ` · ${customer.propertyLabel}` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2 sm:px-6">
        <section>
          <h2 className="text-[13px] font-medium text-[#0E121B]">Kontakt</h2>
          <div className="divide-y divide-[#E1E4EA]">
            <DetailRow icon={User} label="Name" value={customer.name} />
            <DetailRow icon={Phone} label="Telefonnummer" value={customer.phone} />
            <DetailRow icon={Mail} label="E-Mail" value={customer.email} />
            <DetailRow icon={MapPin} label="Adresse" value={customer.address} />
            {rentalValue ? (
              <DetailRow
                icon={CalendarClock}
                label="Mietdauer"
                value={rentalValue}
              />
            ) : null}
          </div>
        </section>

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
                  {appointment.eventUrl ? (
                    <a
                      href={appointment.eventUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-[12px] text-[#335cff] hover:underline"
                    >
                      Im Kalender öffnen
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
