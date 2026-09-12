/** Presentation contracts only. No database, credential, or mutation authority. */
export type ViewState<T> =
  | { status: "ready"; data: T }
  | {
      status:
        | "loading"
        | "empty"
        | "denied"
        | "unavailable"
        | "error"
        | "pending_unknown";
      message?: string;
    };
export type Relationship =
  "going" | "invited" | "interested" | "host" | "exploring";
export type Module = "overview" | "team" | "todo" | "resources";
export type Tone = "neutral" | "success" | "warning" | "error" | "info";
export interface EventProjection {
  identity: {
    id: string;
    displayVersion: number;
    title: string;
    lifecycle: "published" | "cancelled";
  };
  context: { actorId: string; relationship: Relationship };
  access: { canView: boolean; canManage: boolean; modules: Module[] };
  participation?: {
    status: "confirmed" | "invited" | "pending_unknown";
    people: number;
  };
  attention?: { title: string; detail: string; tone: Tone };
  operations?: {
    participants: number;
    team: { name: string; role: string; status: "Confirmed" | "Pending" }[];
    todo: Operation[];
    resources: Operation[];
  };
  presentation: {
    image: string;
    imageAlt: string;
    category: string;
    tags: string[];
    date: string;
    time: string;
    location: string;
    distanceKm: number;
    description: string;
    hostName: string;
    hostVerified: boolean;
  };
  provenance: "local_fixture";
}
export interface Operation {
  id: string;
  title: string;
  detail: string;
  status: string;
  tone: Tone;
}
export interface PresentationWeights {
  explorer: number;
  nearbySpontaneous: number;
  connector: number;
  plannerParticipant: number;
}
export const defaultWeights: PresentationWeights = {
  explorer: 0.7,
  nearbySpontaneous: 0.5,
  connector: 0.4,
  plannerParticipant: 0.7,
};
export const rootDestinations = [
  { path: "/home", label: "Home" },
  { path: "/discover", label: "Discover" },
  { path: "/events", label: "Events" },
  { path: "/feed", label: "Feed" },
] as const;
export const eventViews = [
  "Upcoming",
  "Invited",
  "Interested",
  "Hosting",
] as const;
export function eventsForView(events: EventProjection[], view: string) {
  return events.filter(
    (e) =>
      e.access.canView &&
      (
        {
          Upcoming: ["going"],
          Invited: ["invited"],
          Interested: ["interested"],
          Hosting: ["host"],
        }[view] ?? []
      ).includes(e.context.relationship),
  );
}
export function hostProjection(
  event: EventProjection | undefined,
): ViewState<EventProjection> {
  if (!event) return { status: "unavailable" };
  if (!event.access.canView || !event.access.canManage)
    return { status: "denied" };
  if (!event.operations) return { status: "pending_unknown" };
  return { status: "ready", data: event };
}
