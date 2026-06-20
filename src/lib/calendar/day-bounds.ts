import { DEFAULT_TZ } from "./types";

function timeZoneOffsetMs(at: Date, timeZone: string): number {
  const utc = new Date(at.toLocaleString("en-US", { timeZone: "UTC" }));
  const zoned = new Date(at.toLocaleString("en-US", { timeZone }));
  return zoned.getTime() - utc.getTime();
}

/** RFC3339 bounds for listing all events on a calendar day in an IANA timezone. */
export function dayBoundsInTimeZone(
  dayIso: string,
  timeZone: string = DEFAULT_TZ
): { timeMin: string; timeMax: string } {
  const noon = new Date(`${dayIso}T12:00:00.000Z`);
  const offsetMs = timeZoneOffsetMs(noon, timeZone);
  const dayStartMs = Date.parse(`${dayIso}T00:00:00.000Z`) - offsetMs;
  const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000 - 1;

  return {
    timeMin: new Date(dayStartMs).toISOString(),
    timeMax: new Date(dayEndMs).toISOString(),
  };
}
