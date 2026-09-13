export type ResponseState =
  "AWAITING_RESPONSE" | "RECONFIRMED" | "RELEASED_DECLINED";
export type Disposition =
  | "OPEN_UNRESOLVED"
  | "PENDING_EXTERNAL"
  | "RESOLVED"
  | "WAIVED"
  | "SUPERSEDED"
  | "EXCEPTION";
export type ProviderState =
  "CONFIRMED" | "UNKNOWN" | "PENDING" | "FAILED" | "STALE";
export type CommandStatus = "ready" | "error" | "denied" | "pending_unknown";
export interface CommandResult {
  status: CommandStatus;
  operation_id?: string;
  event_id?: string;
  current_version?: number;
  error_code?: string;
  token?: string;
}
export interface EventVersion {
  id: string;
  version_number: number;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  venue_label: string;
  cover_key?: string;
  capacity?: number | null;
  materiality_class: string;
}
export interface Participant {
  id: string;
  display_name: string;
  commitment_state: string;
  invitation_state?: string;
  invitation_email?: string;
  link_revoked?: boolean;
  response: ResponseState | null;
}
export interface Consequence {
  id: string;
  applicable_event_version_id: string;
  disposition: Disposition;
  row_version: number;
  predecessor_case_id: string | null;
  reason: string | null;
}
export interface Evidence {
  id: string;
  observed_status: ProviderState;
  applicable_event_version_id: string;
  authoritative_at: string;
  source_kind: string;
  external_evidence_id: string;
}
export interface HostProjection {
  event: {
    id: string;
    event_kind?: "FIXTURE" | "SIMPLE";
    lifecycle: "DRAFT" | "PUBLISHED" | "CANCELLED" | "CLOSED";
    current_version_number: number;
  };
  version: EventVersion;
  versions: EventVersion[];
  participants: Participant[];
  cases: Consequence[];
  suggestion: {
    id: string;
    suggestion_state: "SUGGESTED" | "ACCEPTED" | "DISMISSED" | "NONE";
  } | null;
  provider: Evidence | null;
  communications: { dispatch_state: string; count: number }[];
  audit: {
    id: string;
    audit_kind: string;
    created_at: string;
    metadata: Record<string, unknown>;
  }[];
}
export interface EventOperationsProjection {
  status: CommandStatus;
  error_code?: string;
  todos: { id: string; title: string; due_at: string | null; state: "OPEN" | "DONE"; assignee_team_member_id: string | null }[];
  resources: { id: string; label: string; quantity: number; state: "NEEDED" | "READY"; note: string | null; assignee_team_member_id: string | null }[];
}
export type TeamRole = "CO_HOST" | "EVENT_MANAGER" | "CHECK_IN_STAFF" | "VOLUNTEER" | "PHOTOGRAPHER";
export type TeamVisibility = "EVENT_TEAM" | "PUBLIC_ROLE" | "HIDDEN";
export interface TeamMember { id: string; user_id: string; email: string; display_name: string; role: TeamRole; attends_event: boolean; public_visibility: TeamVisibility }
export interface TeamProjection { status: CommandStatus; error_code?: string; members: TeamMember[] }
export interface CheckInProjection {
  status: CommandStatus;
  error_code?: string;
  event: { id: string; lifecycle: string; title: string; starts_at: string; timezone: string };
  counts: { eligible: number; admitted: number };
  participants: { id: string; display_name: string; commitment_state: string; checked_in_at: string | null }[];
}
export interface CheckInResult extends CommandResult { result?: "ADMITTED" | "ALREADY_USED" | "WRONG_EVENT" | "INVALID" | "UNABLE_TO_VERIFY" }
export function settlement(responses: ResponseState[]) {
  const terminal = responses.filter(
    (s) => s === "RECONFIRMED" || s === "RELEASED_DECLINED",
  ).length;
  return {
    total: responses.length,
    terminal,
    unresolved: responses.length - terminal,
    settled: responses.length > 0 && terminal === responses.length,
  };
}
export function providerOutcome(
  evidence: Evidence | null,
  versionId: string,
): ProviderState {
  if (!evidence) return "UNKNOWN";
  return evidence.applicable_event_version_id === versionId
    ? evidence.observed_status
    : "STALE";
}
export function validateTimeChange(startsAt: string, endsAt: string): boolean {
  return (
    Number.isFinite(Date.parse(startsAt)) &&
    Date.parse(startsAt) < Date.parse(endsAt)
  );
}
export const errorMessages: Record<string, string> = {
  VERIFY_EMAIL: "Verify the email address this invitation was sent to.",
  INVITATION_UNAVAILABLE:
    "This invitation is unavailable for the verified email address.",
  ALREADY_INVITED:
    "This email already has an invitation. Use its existing participant row to replace the link.",
  CAPACITY_FULL:
    "This event is full. Your invitation does not reserve a place.",
  PUBLISH_BLOCKED:
    "Add a title, location and valid future start/end time, then review and confirm publication.",
  STALE_CONFLICT:
    "This event changed while you were viewing it. Refresh and review the current details before trying again.",
  UNAUTHORIZED: "You do not have permission to make this change.",
  TOKEN_INVALID:
    "This response link is unavailable or has been replaced. Ask the host for a new link.",
  TOKEN_EXPIRED: "This response link has expired. Ask the host for a new link.",
  INVALID_STATE: "This action is no longer available in the current state.",
  INVALID_CONFIRMATION: "Review and explicitly confirm this change first.",
  INVALID_INPUT: "Check the supplied details and try again.",
  IDEMPOTENCY_MISMATCH:
    "This retry does not match the original request. Refresh before starting a new action.",
};
