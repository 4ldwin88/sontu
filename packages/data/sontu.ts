import { recordDiagnostic } from "./diagnostics";
import { clientUuid } from "./ids";
import { createClient } from "@supabase/supabase-js";
import type {
  CheckInProjection,
  CheckInResult,
  CommandResult,
  EventOperationsProjection,
  EventResultsProjection,
  HostProjection,
  TeamProjection,
} from "../domain/coordination";
export function resolveSupabaseUrl(
  configuredUrl: string,
  pageHostname = typeof window === "undefined" ? "" : window.location.hostname,
) {
  if (
    !pageHostname ||
    pageHostname === "localhost" ||
    pageHostname === "127.0.0.1"
  )
    return configuredUrl;
  try {
    const url = new URL(configuredUrl);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      url.hostname = pageHostname;
      return url.toString().replace(/\/$/, "");
    }
  } catch {
    return configuredUrl;
  }
  return configuredUrl;
}
// Publishable key only. All authorization and consequential writes are enforced by RPCs.
export const supabase = createClient(
  resolveSupabaseUrl(
    import.meta.env.VITE_SUPABASE_URL ??
      "https://zukfxasttgmtygnsqqav.supabase.co",
  ),
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    "sb_publishable_HOaki0v0jS9BmMSv8MuQng_Oh4X39wm",
);
export const eventMediaBucket = "event-media";
export const organizationMediaBucket = "organization-media";
export const eventCoverUrl = (coverKey?: string | null) => {
  if (!coverKey || coverKey === "none") return "";
  if (coverKey.startsWith("upload:"))
    return supabase.storage
      .from(eventMediaBucket)
      .getPublicUrl(coverKey.slice("upload:".length)).data.publicUrl;
  return `images/${coverKey}.jpg`;
};
export const organizationLogoUrl = (path?: string | null) =>
  path
    ? supabase.storage.from(organizationMediaBucket).getPublicUrl(path).data
        .publicUrl
    : "";
export class TransportUnknown extends Error {}
export async function rpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    recordDiagnostic("request_failed");
    throw new TransportUnknown(
      "The server could not confirm the outcome. Refresh or retry the same request.",
    );
  }
  if (data?.status === "denied") recordDiagnostic("access_denied");
  return data as T;
}
export const hostRead = (id: string) =>
  rpc<{ status: string; data?: HostProjection; error_code?: string }>(
    "sontu_host_projection",
    { event_id: id },
  );
export const hostCommand = (
  cmd: string,
  event_id: string | null,
  expected_version: number | null,
  input: Record<string, unknown>,
  operation_id: string,
) =>
  rpc<CommandResult>("sontu_host_command", {
    cmd,
    event_id,
    expected_version,
    input,
    operation_id,
  });
export const changeEventCover = (
  event_id: string,
  expected_version: number,
  cover_key: string,
  operation_id: string,
) =>
  rpc<CommandResult>("sontu_change_event_cover", {
    event_id,
    expected_version,
    cover_key,
    operation_id,
  });
export type OrganizationContext = {
  id: string;
  display_name: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  member_count?: number;
  organization_type?: OrganizationType;
  description?: string;
  visibility?: "PUBLIC" | "PRIVATE";
  lifecycle?: OrganizationLifecycle;
  accepted_successor_count?: number;
  logo_path?: string | null;
};
export type OrganizationType =
  | "BUSINESS"
  | "NONPROFIT"
  | "COMMUNITY"
  | "VENUE"
  | "EDUCATION"
  | "GOVERNMENT"
  | "OTHER";
export type OrganizationLifecycle =
  "SETUP_INCOMPLETE" | "ACTIVE" | "CONTINUITY_ACTION_REQUIRED" | "RETIRED";
export type OrganizationSuccessor = {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  priority: number;
  status: "PENDING" | "ACCEPTED";
  accepted_at?: string | null;
};
export type SuccessorRequest = {
  id: string;
  organization_id: string;
  organization_name: string;
  priority: number;
  status: "PENDING";
  nominated_by: string;
};
export type OrganizationMember = {
  user_id: string;
  email: string;
  display_name: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  status: "ACTIVE";
};
export const organizationContext = () =>
  rpc<{ status: string; organizations: OrganizationContext[] }>(
    "sontu_organization_context",
    { action: "list", input: {}, organization_id: null, operation_id: null },
  );
export const createOrganization = (
  input: {
    display_name: string;
    organization_type: OrganizationType;
    description: string;
    visibility: "PUBLIC" | "PRIVATE";
    successor_email: string;
  },
  operation_id: string,
) =>
  rpc<{
    status: string;
    error_code?: string;
    organization?: OrganizationContext;
  }>("sontu_organization_setup", { input, operation_id });
export const organizationDetail = (organization_id: string) =>
  rpc<{
    status: string;
    error_code?: string;
    organization?: OrganizationContext & { can_manage: boolean };
    members?: OrganizationMember[];
  }>("sontu_organization_context", {
    action: "detail",
    input: {},
    organization_id,
    operation_id: null,
  });
export const organizationMemberCommand = (
  action: "add_member" | "update_member" | "remove_member",
  organization_id: string,
  input: Record<string, unknown>,
  operation_id: string,
) =>
  rpc<{ status: string; error_code?: string; user_id?: string }>(
    "sontu_organization_context",
    { action, input, organization_id, operation_id },
  );
export const organizationOverview = () =>
  rpc<{
    status: string;
    organizations: OrganizationContext[];
    requests: SuccessorRequest[];
  }>("sontu_organization_governance", {
    action: "overview",
    organization_id: null,
    input: {},
    operation_id: null,
  });
export const organizationLogos = () =>
  rpc<{
    status: string;
    logos?: Array<{ organization_id: string; logo_path: string | null }>;
  }>("sontu_organization_logo", {
    action: "overview",
    organization_id: null,
    logo_path: null,
    operation_id: null,
  });
export const setOrganizationLogo = (
  organization_id: string,
  logo_path: string | null,
  operation_id: string,
) =>
  rpc<{ status: string; error_code?: string; logo_path?: string | null }>(
    "sontu_organization_logo",
    { action: "write", organization_id, logo_path, operation_id },
  );
export const organizationGovernanceDetail = (organization_id: string) =>
  rpc<{
    status: string;
    error_code?: string;
    organization?: OrganizationContext & {
      can_edit: boolean;
      can_govern: boolean;
    };
    successors?: OrganizationSuccessor[];
  }>("sontu_organization_governance", {
    action: "detail",
    organization_id,
    input: {},
    operation_id: null,
  });
export const organizationGovernanceCommand = (
  action:
    | "update"
    | "nominate_successor"
    | "respond_successor"
    | "revoke_successor"
    | "retire",
  organization_id: string,
  input: Record<string, unknown>,
  operation_id: string,
) =>
  rpc<{ status: string; error_code?: string }>(
    "sontu_organization_governance",
    { action, organization_id, input, operation_id },
  );
export const eventOwner = (
  event_id: string,
  owner_kind: "PERSONAL" | "ORGANIZATION" | null = null,
  organization_id: string | null = null,
) =>
  rpc<{
    status: string;
    error_code?: string;
    owner_kind?: "PERSONAL" | "ORGANIZATION";
    organization_id?: string | null;
    owner_name?: string;
  }>("sontu_event_owner", { event_id, owner_kind, organization_id });
export const eventOperationsRead = (event_id: string) =>
  rpc<EventOperationsProjection>("sontu_event_operations_projection", {
    event_id,
  });
export const eventOperationsCommand = (
  cmd: string,
  event_id: string,
  item_id: string | null,
  input: Record<string, unknown>,
) =>
  rpc<CommandResult>("sontu_event_operations_command", {
    cmd,
    event_id,
    item_id,
    input,
    operation_id: clientUuid(),
  });
export const teamRead = (event_id: string) =>
  rpc<TeamProjection>("sontu_team_projection", { event_id });
export const teamCommand = (
  cmd: string,
  event_id: string,
  member_id: string | null,
  input: Record<string, unknown>,
) =>
  rpc<CommandResult>("sontu_team_command", {
    cmd,
    event_id,
    member_id,
    input,
    operation_id: clientUuid(),
  });
export const assignOperationItem = (
  kind: "todo" | "resource",
  event_id: string,
  item_id: string,
  team_member_id: string | null,
) =>
  rpc<CommandResult>("sontu_assign_operation_item", {
    kind,
    event_id,
    item_id,
    team_member_id,
    operation_id: clientUuid(),
  });
export const checkInRead = (event_id: string) =>
  rpc<CheckInProjection>("sontu_check_in_projection", { event_id });
export const checkInParticipant = (event_id: string, participant_id: string) =>
  rpc<CheckInResult>("sontu_check_in_command", {
    event_id,
    participant_id,
    operation_id: clientUuid(),
  });
export const checkInCredential = (event_id: string, credential_id: string) =>
  rpc<CheckInResult>("sontu_check_in_credential_command", {
    event_id,
    credential_id,
    operation_id: clientUuid(),
  });
export const resultsRead = (event_id: string) =>
  rpc<EventResultsProjection>("sontu_results_projection", { event_id });
export const closeEvent = (event_id: string) =>
  rpc<CommandResult>("sontu_close_event", {
    event_id,
    operation_id: clientUuid(),
    confirmed: true,
  });
export const startEvent = (event_id: string) =>
  rpc<CommandResult>("sontu_start_event", {
    event_id,
    operation_id: clientUuid(),
  });
export type EventDeliverySummary = {
  kind: "EVENT_CHANGE" | "GUEST_RSVP_CONFIRMATION" | "EVENT_CANCELLED";
  state:
    | "PENDING"
    | "PROCESSING"
    | "SENT"
    | "FAILED_RETRYABLE"
    | "CONFIGURATION_UNAVAILABLE"
    | "FAILED_PERMANENT";
  count: number;
};
export const eventDeliveryRead = (event_id: string) =>
  rpc<{ status: string; error_code?: string; summary: EventDeliverySummary[] }>(
    "sontu_event_delivery_projection",
    { event_id },
  );
export async function dispatchEventEmail(event_id: string) {
  const { data, error } = await supabase.functions.invoke(
    "event-email-dispatch",
    { body: { event_id } },
  );
  if (error)
    throw new TransportUnknown("The delivery request could not be confirmed.");
  return data as {
    status: "ready" | "configuration_unavailable";
    processed: number;
    sent?: number;
    failed?: number;
  };
}
export async function sendInvitationEmail(input: { event_id: string; recipient_email: string; token: string; invitation_url: string }) {
  const { data, error } = await supabase.functions.invoke("invitation-email", { body: input });
  if (error) throw new TransportUnknown("The invitation email could not be confirmed.");
  return data as { status: "ready" | "failed" | "configuration_unavailable" };
}
export function createParticipantToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

