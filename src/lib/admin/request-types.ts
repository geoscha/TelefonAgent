export type RequestStatus = "offen" | "in_arbeit" | "erledigt" | "abgelehnt";

export type RequestType =
  | "nummer_zuweisung"
  | "agent_freigabe"
  | "support"
  | string;

export interface UserRequest {
  id: string;
  userId: string;
  type: RequestType;
  status: RequestStatus;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  userName?: string;
  userEmail?: string;
}

const TYPE_LABELS: Record<string, string> = {
  nummer_beantragen: "Nummer beantragen",
  nummer_zuweisung: "Nummer-Zuweisung",
  agent_freigabe: "Agent-Freigabe",
  support: "Support",
};

export function requestTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

export function isPhoneNumberRequest(type: string): boolean {
  return type === "nummer_beantragen" || type === "nummer_zuweisung";
}

export const STATUS_LABELS: Record<RequestStatus, string> = {
  offen: "Offen",
  in_arbeit: "In Arbeit",
  erledigt: "Erledigt",
  abgelehnt: "Abgelehnt",
};
