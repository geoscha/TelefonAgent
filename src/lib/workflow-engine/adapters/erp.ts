import type { WorkflowCase } from "@/lib/workflow-engine/types";

export interface ErpPushResult {
  ok: boolean;
  externalId?: string;
  error?: string;
}

export interface ErpCaseAdapter {
  readonly providerId: string;
  pushCase(workflowCase: WorkflowCase): Promise<ErpPushResult>;
}

const adapters = new Map<string, ErpCaseAdapter>();

export function registerErpCaseAdapter(adapter: ErpCaseAdapter): void {
  adapters.set(adapter.providerId, adapter);
}

export function getErpCaseAdapter(providerId: string): ErpCaseAdapter | null {
  return adapters.get(providerId) ?? null;
}

export async function pushCaseToErp(
  providerId: string,
  workflowCase: WorkflowCase
): Promise<ErpPushResult> {
  const adapter = getErpCaseAdapter(providerId);
  if (!adapter) {
    return { ok: false, error: `Kein ERP-Adapter für ${providerId}` };
  }
  return adapter.pushCase(workflowCase);
}

/** Placeholder — wire when first ERP target is chosen. */
export const noopErpAdapter: ErpCaseAdapter = {
  providerId: "noop",
  async pushCase() {
    return { ok: true, externalId: undefined };
  },
};
