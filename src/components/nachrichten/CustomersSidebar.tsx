"use client";

import { ChevronDown } from "lucide-react";

import { landingPanelClass } from "@/components/landing/landing-buttons";
import type { CustomerWithAppointments } from "@/lib/customers/types";
import { cn } from "@/lib/utils";

interface CollapsibleRecordSectionProps {
  title: string;
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  emptyLabel: string;
  records: CustomerWithAppointments[];
  selectedId: string | null;
  onSelect: (recordId: string) => void;
  subtitle?: (record: CustomerWithAppointments) => string | null | undefined;
}

function CollapsibleRecordSection({
  title,
  count,
  open,
  onOpenChange,
  emptyLabel,
  records,
  selectedId,
  onSelect,
  subtitle,
}: CollapsibleRecordSectionProps) {
  return (
    <div
      className={cn(
        landingPanelClass,
        "flex min-h-0 flex-col overflow-hidden",
        open ? "flex-1" : "shrink-0"
      )}
    >
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-center justify-between gap-2 border-b border-[#E1E4EA] px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span className="truncate text-[12px] font-medium text-[#0E121B]">
          {title}
          <span className="ml-1.5 font-normal text-[#99A0AE]">({count})</span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[#99A0AE] transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open ? (
        records.length > 0 ? (
          <ul className="min-h-0 flex-1 divide-y divide-[#E1E4EA] overflow-y-auto">
            {records.map((record) => {
              const selected = selectedId === record.id;
              const secondary = subtitle?.(record);
              return (
                <li key={record.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(record.id)}
                    className={cn(
                      "landing-body flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition-colors",
                      selected
                        ? "bg-[#F5F7FA] text-[#0E121B]"
                        : "text-[#525866] hover:bg-[#F5F7FA] hover:text-[#0E121B]"
                    )}
                  >
                    <span className="truncate font-medium">{record.name}</span>
                    {secondary ? (
                      <span className="truncate text-[11px] text-[#99A0AE]">
                        {secondary}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="landing-body px-3 py-6 text-center text-[#99A0AE]">
            {emptyLabel}
          </p>
        )
      ) : null}
    </div>
  );
}

interface CustomersSidebarProps {
  customers: CustomerWithAppointments[];
  craftsmen: CustomerWithAppointments[];
  selectedCustomerId: string | null;
  selectedCraftsmanId: string | null;
  customersOpen: boolean;
  craftsmenOpen: boolean;
  onCustomersOpenChange: (open: boolean) => void;
  onCraftsmenOpenChange: (open: boolean) => void;
  loading?: boolean;
  onSelectCustomer: (customerId: string) => void;
  onSelectCraftsman: (craftsmanId: string) => void;
}

export function CustomersSidebar({
  customers,
  craftsmen,
  selectedCustomerId,
  selectedCraftsmanId,
  customersOpen,
  craftsmenOpen,
  onCustomersOpenChange,
  onCraftsmenOpenChange,
  loading = false,
  onSelectCustomer,
  onSelectCraftsman,
}: CustomersSidebarProps) {
  if (loading) {
    return (
      <div className="flex w-[200px] shrink-0 flex-col gap-2 self-stretch lg:w-[220px]">
        <div className={cn(landingPanelClass, "flex min-h-0 flex-1 flex-col overflow-hidden")}>
          <p className="landing-body px-3 py-6 text-center text-[#99A0AE]">
            Lädt…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-[200px] shrink-0 flex-col gap-2 self-stretch lg:w-[220px]">
      <CollapsibleRecordSection
        title="Mieter / Kunden"
        count={customers.length}
        open={customersOpen}
        onOpenChange={onCustomersOpenChange}
        emptyLabel="Keine Mieter"
        records={customers}
        selectedId={selectedCustomerId}
        onSelect={onSelectCustomer}
        subtitle={(record) => record.propertyLabel}
      />
      <CollapsibleRecordSection
        title="Handwerker"
        count={craftsmen.length}
        open={craftsmenOpen}
        onOpenChange={onCraftsmenOpenChange}
        emptyLabel="Keine Handwerker"
        records={craftsmen}
        selectedId={selectedCraftsmanId}
        onSelect={onSelectCraftsman}
        subtitle={(record) => record.trade ?? record.propertyLabel}
      />
    </div>
  );
}
