import { Suspense } from "react";

import { CalendarPageClient } from "@/components/calendar/CalendarPageClient";

export default function KalenderPage() {
  return (
    <Suspense fallback={null}>
      <CalendarPageClient />
    </Suspense>
  );
}
