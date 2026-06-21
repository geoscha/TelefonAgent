import type { ReactNode } from "react";

export interface IntegrationCardEntry {
  key: string;
  name: string;
  connected: boolean;
  node: ReactNode;
}

export function sortIntegrationCards(
  entries: IntegrationCardEntry[]
): IntegrationCardEntry[] {
  return [...entries].sort((a, b) => {
    if (a.connected !== b.connected) {
      return a.connected ? -1 : 1;
    }
    return a.name.localeCompare(b.name, "de");
  });
}

export function compareConnectedThenName(
  a: { connected: boolean; name: string },
  b: { connected: boolean; name: string }
): number {
  if (a.connected !== b.connected) {
    return a.connected ? -1 : 1;
  }
  return a.name.localeCompare(b.name, "de");
}
