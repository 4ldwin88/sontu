import type { EventProjection, Relationship } from "../application/projections";
const make = (
  id: string,
  title: string,
  image: string,
  category: string,
  relationship: Relationship,
  date: string,
  time: string,
  location: string,
  description: string,
  distanceKm: number,
): EventProjection => ({
  identity: { id, displayVersion: 1, title, lifecycle: "published" },
  context: { actorId: "demo-you", relationship },
  access: {
    canView: true,
    canManage: relationship === "host",
    modules:
      relationship === "host" ? ["overview", "team", "todo", "resources"] : [],
  },
  ...(relationship === "going" || relationship === "invited"
    ? {
        participation: {
          status:
            relationship === "going"
              ? ("confirmed" as const)
              : ("invited" as const),
          people: 12,
        },
      }
    : {}),
  presentation: {
    image: `images/${image}.jpg`,
    imageAlt: (
      {
        sunset: "Soft sunlight over a tropical beach",
        sailing: "Sailing boats on blue water",
        market: "Lantern-lit evening street",
        yoga: "A person practicing yoga on a beach at sunrise",
        music: "Crowd enjoying a live concert",
        food: "Freshly prepared food shared at a table",
      } as Record<string, string>
    )[image],
    category,
    tags: [category, relationship === "host" ? "Community" : "Together"],
    date,
    time,
    location,
    distanceKm,
    description,
    hostName: "Coast & Company",
    hostVerified: false,
  },
  provenance: "local_fixture",
});
export const events: EventProjection[] = [
  make(
    "sunset-social",
    "Sunset Social at Diamond Bay",
    "sunset",
    "Food & Drink",
    "host",
    "Sat, Sep 12",
    "5:00–9:00 PM",
    "Diamond Bay · Nha Trang",
    "An easy evening by the water. Share good food, meet a few new faces, and watch the coast turn gold. Come as you are.",
    2.1,
  ),
  make(
    "sailing",
    "A morning under sail",
    "sailing",
    "Outdoors",
    "going",
    "Sun, Sep 13",
    "8:00 AM–1:00 PM",
    "Nha Trang Marina",
    "A small-group morning on the water, with time to slow down and take in the islands.",
    4.2,
  ),
  make(
    "night-market",
    "Lanterns & local flavours",
    "market",
    "Food & Drink",
    "going",
    "Tue, Sep 15",
    "6:00–9:00 PM",
    "Nha Trang Night Market",
    "Meet at the market entrance and explore the stalls together. Bring your appetite and comfortable shoes.",
    3.1,
  ),
  make(
    "beach-yoga",
    "Slow mornings by the sea",
    "yoga",
    "Wellness",
    "interested",
    "Sun, Sep 20",
    "7:00–8:30 AM",
    "Nha Trang Beach",
    "A relaxed morning of movement and breathing, followed by coffee with the group.",
    1.8,
  ),
  make(
    "live-music",
    "Coastal sessions: live music",
    "music",
    "Music",
    "interested",
    "Fri, Sep 25",
    "7:00–10:00 PM",
    "The Coast Pavilion",
    "An intimate evening of live music with local artists and a sea breeze.",
    2.4,
  ),
  make(
    "shared-table",
    "The shared table",
    "food",
    "Food & Drink",
    "invited",
    "Sat, Sep 19",
    "6:00–8:30 PM",
    "Nha Trang · Private gathering",
    "A small evening gathering around a shared table. Your invitation includes the event details.",
    3.5,
  ),
];
events[0].operations = {
  participants: 24,
  team: [
    { name: "You", role: "Host", status: "Confirmed" },
    { name: "Alex", role: "Event support", status: "Confirmed" },
    { name: "Minh", role: "Welcome desk", status: "Pending" },
  ],
  todo: [
    {
      id: "sound",
      title: "Confirm the sound setup",
      detail: "Alex · Today, 2:00 PM",
      status: "Awaiting confirmation",
      tone: "warning",
    },
    {
      id: "welcome",
      title: "Prepare the welcome area",
      detail: "You · Today, 4:00 PM",
      status: "To do",
      tone: "neutral",
    },
  ],
  resources: [
    {
      id: "speaker",
      title: "Portable speaker",
      detail: "1 set · Alex",
      status: "Pending confirmation",
      tone: "warning",
    },
    {
      id: "tables",
      title: "Shared tables",
      detail: "4 tables · Venue",
      status: "Confirmed",
      tone: "success",
    },
  ],
};
events[0].attention = {
  title: "Sound setup needs confirmation",
  detail:
    "The supplier response is still pending. Readiness has not been confirmed.",
  tone: "warning",
};
export const eventById = (id?: string) =>
  events.find((e) => e.identity.id === id);
export const feed = [
  {
    id: "update",
    eventId: "sunset-social",
    kind: "Host update",
    time: "30 min ago",
    title: "A little closer to the water.",
    body: "We’ll meet by the beach terrace this evening. Open the event for the current meeting details.",
    image: false,
  },
  {
    id: "story",
    eventId: "night-market",
    kind: "Event story",
    time: "2 hours ago",
    title: "Follow the lanterns.",
    body: "Small stalls, big flavours. A glimpse of the evening we’re planning together.",
    image: true,
  },
  {
    id: "music",
    eventId: "live-music",
    kind: "Event preview",
    time: "4 hours ago",
    title: "Your Friday soundtrack.",
    body: "An evening for discovering local sounds and staying for one more song.",
    image: true,
  },
];
