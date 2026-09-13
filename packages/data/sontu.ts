import { recordDiagnostic } from "./diagnostics";
import { createClient } from "@supabase/supabase-js";
import type { CheckInProjection, CheckInResult, CommandResult, EventOperationsProjection, HostProjection, TeamProjection } from "../domain/coordination";
// Publishable key only. All authorization and consequential writes are enforced by RPCs.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL ??
    "https://zukfxasttgmtygnsqqav.supabase.co",
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    "sb_publishable_HOaki0v0jS9BmMSv8MuQng_Oh4X39wm",
);
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
export const eventOperationsRead = (event_id: string) =>
  rpc<EventOperationsProjection>("sontu_event_operations_projection", { event_id });
export const eventOperationsCommand = (
  cmd: string,
  event_id: string,
  item_id: string | null,
  input: Record<string, unknown>,
) => rpc<CommandResult>("sontu_event_operations_command", {
  cmd, event_id, item_id, input, operation_id: crypto.randomUUID(),
});
export const teamRead = (event_id: string) => rpc<TeamProjection>("sontu_team_projection", { event_id });
export const teamCommand = (cmd: string,event_id: string,member_id: string | null,input: Record<string,unknown>) =>
  rpc<CommandResult>("sontu_team_command",{cmd,event_id,member_id,input,operation_id:crypto.randomUUID()});
export const assignOperationItem = (kind: "todo"|"resource",event_id: string,item_id: string,team_member_id: string|null) =>
  rpc<CommandResult>("sontu_assign_operation_item",{kind,event_id,item_id,team_member_id,operation_id:crypto.randomUUID()});
export const checkInRead = (event_id: string) => rpc<CheckInProjection>("sontu_check_in_projection",{event_id});
export const checkInParticipant = (event_id: string,participant_id: string) => rpc<CheckInResult>("sontu_check_in_command",{event_id,participant_id,operation_id:crypto.randomUUID()});
export function createParticipantToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
