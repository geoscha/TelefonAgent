"use client";

import { landingPanelClass } from "@/components/landing/landing-buttons";
import type { CustomerWithAppointments } from "@/lib/customers/types";
import { cn } from "@/lib/utils";

interface CustomersSidebarProps {
  customers: CustomerWithAppointments[];
  selectedCustomerId: string | null;
  loading?: boolean;
  onSelect: (customerId: string) => void;
}

export function CustomersSidebar({
  customers,
  selectedCustomerId,
  loading = false,
  onSelect,
}: CustomersSidebarProps) {
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
        ) : customers.length > 0 ? (
          <ul className="divide-y divide-[#E1E4EA] overflow-y-auto">
            {customers.map((customer) => {
              const selected = selectedCustomerId === customer.id;
              return (
                <li key={customer.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(customer.id)}
                    className={cn(
                      "landing-body flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition-colors",
                      selected
                        ? "bg-[#F5F7FA] text-[#0E121B]"
                        : "text-[#525866] hover:bg-[#F5F7FA] hover:text-[#0E121B]"
                    )}
                  >
                    <span className="truncate font-medium">{customer.name}</span>
                    {customer.propertyLabel ? (
                      <span className="truncate text-[11px] text-[#99A0AE]">
                        {customer.propertyLabel}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="landing-body px-3 py-6 text-center text-[#99A0AE]">
            Keine Kunden
          </p>
        )}
      </div>
    </div>
  );
}
