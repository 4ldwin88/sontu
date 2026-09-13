// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
let db: PGlite;
const host = randomUUID(),
  stranger = randomUUID();
let event: string,
  version = 1;
async function sql<T = Record<string, unknown>>(
  q: string,
  args: unknown[] = [],
) {
  return (await db.query<T>(q, args)).rows;
}
async function command(
  cmd: string,
  input: Record<string, unknown> = {},
  expected = version,
  op = randomUUID(),
) {
  const rows = await sql<{ r: any }>(
    "select public.sontu_host_command($1,$2,$3,$4,$5) r",
    [cmd, event ?? null, expected, op, JSON.stringify(input)],
  );
  if (rows[0].r.status === "ready" && rows[0].r.current_version)
    version = rows[0].r.current_version;
  return rows[0].r;
}
async function projection() {
  return (
    await sql<{ r: any }>("select public.sontu_host_projection($1) r", [event])
  )[0].r.data;
}
async function response(
  token: string,
  decision: string | null = null,
  expected = version,
  op = randomUUID(),
) {
  return (
    await sql<{ r: any }>(
      "select public.sontu_participant_access($1,$2,$3,$4) r",
      [token, decision, expected, op],
    )
  )[0].r;
}
async function asHost(id = host) {
  await sql("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false); create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated;",
  );
  await sql("insert into auth.users(id) values($1),($2)", [host, stranger]);
  const dir = resolve(process.cwd(), "../../supabase/migrations");
  for (const name of readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(resolve(dir, name), "utf8"));
  await asHost();
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("frozen Core Validation persistence contract", () => {
  it("creates one draft atomically and safe retries return the same event", async () => {
    const op = randomUUID();
    const r = await command("create_fixture", {}, 1, op);
    expect(r.status).toBe("ready");
    event = r.event_id;
    const again = (
      await sql<{ r: any }>(
        "select public.sontu_host_command($1,null,1,$2,$3) r",
        ["create_fixture", op, "{}"],
      )
    )[0].r;
    expect(again).toEqual(r);
    expect((await projection()).participants).toHaveLength(12);
    expect((await command("publish")).status).toBe("ready");
  });
  it("cosmetic edit preserves history without creating obligations", async () => {
    expect(
      (
        await command("cosmetic_edit", {
          description: "A relaxed evening of food and great company.",
        })
      ).status,
    ).toBe("ready");
    const p = await projection();
    expect(p.versions).toHaveLength(2);
    expect(p.cases).toHaveLength(0);
    expect(p.suggestion).toBeNull();
  });
  it("requires confirmation and rejects stale host edits", async () => {
    expect(
      (await command("change_time", { starts_at: "2026-09-16T23:30:00Z" }))
        .error_code,
    ).toBe("INVALID_CONFIRMATION");
    expect(
      (
        await command(
          "change_time",
          { starts_at: "2026-09-16T23:30:00Z", confirmed: true },
          1,
        )
      ).error_code,
    ).toBe("STALE_CONFLICT");
    expect(
      (
        await command("change_time", {
          starts_at: "2026-09-16T23:30:00Z",
          confirmed: true,
        })
      ).status,
    ).toBe("ready");
    const p = await projection();
    expect(p.cases).toHaveLength(0);
    expect(p.suggestion.suggestion_state).toBe("SUGGESTED");
  });
  it("provider evidence stays at L2, deduplicates, and respects authoritative ordering", async () => {
    const t = new Date(Date.now() - 10000).toISOString();
    const input = {
      provider_status: "CONFIRMED",
      evidence_id: "first",
      authoritative_at: t,
    };
    expect((await command("simulate_provider", input)).status).toBe("ready");
    expect((await command("simulate_provider", input)).status).toBe("ready");
    expect(
      (
        await command("simulate_provider", {
          ...input,
          provider_status: "FAILED",
        })
      ).error_code,
    ).toBe("IDEMPOTENCY_MISMATCH");
    expect((await projection()).cases).toHaveLength(0);
    await command("simulate_provider", {
      provider_status: "UNKNOWN",
      evidence_id: "older",
      authoritative_at: new Date(Date.now() - 20000).toISOString(),
    });
    expect((await projection()).provider.observed_status).toBe("CONFIRMED");
    for (const status of ["UNKNOWN", "PENDING", "FAILED", "STALE"]) {
      await command("simulate_provider", {
        provider_status: status,
        evidence_id: randomUUID(),
        authoritative_at: new Date().toISOString(),
      });
      expect((await projection()).provider.observed_status).toBe(status);
    }
  });
  it("only explicit host acceptance creates the twelve-response case", async () => {
    await command("accept", { confirmed: true });
    const p = await projection();
    expect(p.cases[0].disposition).toBe("OPEN_UNRESOLVED");
    expect(
      p.participants.filter((x: any) => x.response === "AWAITING_RESPONSE"),
    ).toHaveLength(12);
    await command("simulate_delivery", { delivery_status: "DELIVERED" });
    expect((await projection()).cases[0].disposition).toBe("OPEN_UNRESOLVED");
  });
  it("11 of 12 cannot settle; responses are scoped and retries idempotent", async () => {
    const p = await projection();
    for (let i = 0; i < 11; i++) {
      const token = randomBytes(32).toString("hex");
      await command("issue_link", {
        participant_id: p.participants[i].id,
        token,
      });
      const op = randomUUID(),
        decision = i === 10 ? "RELEASED_DECLINED" : "RECONFIRMED";
      const a = await response(token, decision, version, op);
      expect(a.status).toBe("ready");
      expect(await response(token, decision, version, op)).toEqual(a);
      expect((await response(token, "WAIVED")).error_code).toBe("UNAUTHORIZED");
      const scoped = await response(token);
      expect(scoped.participants).toBeUndefined();
      expect(scoped.participant.display_name).toBe(
        p.participants[i].display_name,
      );
    }
    const updated = await projection();
    expect(
      updated.participants.filter(
        (x: any) => x.response === "AWAITING_RESPONSE",
      ),
    ).toHaveLength(1);
    expect(updated.cases[0].disposition).toBe("OPEN_UNRESOLVED");
  });
  it("the twelfth outcome settles; the next material version requires new evidence", async () => {
    let p = await projection();
    const token = randomBytes(32).toString("hex");
    await command("issue_link", {
      participant_id: p.participants[11].id,
      token,
    });
    await response(token, "RECONFIRMED");
    p = await projection();
    expect(p.cases[0].disposition).toBe("RESOLVED");
    const prior = p.cases[0].id,
      old = version;
    await command("change_time", {
      starts_at: "2026-09-17T00:00:00Z",
      confirmed: true,
    });
    p = await projection();
    expect(p.cases[0].predecessor_case_id).toBe(prior);
    expect(p.cases[0].disposition).toBe("OPEN_UNRESOLVED");
    expect(p.cases[1].disposition).toBe("RESOLVED");
    expect(
      p.participants.filter((x: any) => x.response === "AWAITING_RESPONSE"),
    ).toHaveLength(11);
    expect((await response(token, "RECONFIRMED", old)).error_code).toBe(
      "STALE_CONFLICT",
    );
  });
  it("host ownership, direct table writes, and revoked links are enforced", async () => {
    await asHost(stranger);
    expect((await command("cancel", { confirmed: true })).error_code).toBe(
      "UNAUTHORIZED",
    );
    expect(
      (
        await sql<{ r: any }>("select public.sontu_host_projection($1) r", [
          event,
        ])
      )[0].r.status,
    ).toBe("denied");
    await asHost();
    await db.exec("set role authenticated");
    await expect(
      sql("select * from sontu_private.event_instances"),
    ).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
    const p = await projection(),
      token = randomBytes(32).toString("hex");
    await command("issue_link", {
      participant_id: p.participants[0].id,
      token,
    });
    await command("revoke_link", { participant_id: p.participants[0].id });
    expect((await response(token)).error_code).toBe("TOKEN_INVALID");
    expect(
      (
        await sql<{ n: number }>(
          "select count(*)::int n from sontu_private.operations where result ? 'token'",
        )
      )[0].n,
    ).toBe(0);
  });
  it("waiver is explicit, versioned and distinguishable from resolution", async () => {
    const p = await projection(),
      c = p.cases[0];
    expect(
      (
        await command("waive", {
          case_id: c.id,
          row_version: c.row_version,
          reason: "No longer required",
        })
      ).error_code,
    ).toBe("INVALID_CONFIRMATION");
    expect(
      (
        await command("waive", {
          case_id: c.id,
          row_version: 0,
          reason: "No longer required",
          confirmed: true,
        })
      ).error_code,
    ).toBe("STALE_CONFLICT");
    await command("waive", {
      case_id: c.id,
      row_version: c.row_version,
      reason: "Host accepts remaining uncertainty",
      confirmed: true,
    });
    expect((await projection()).cases[0].disposition).toBe("WAIVED");
  });
  it("cancellation does not silently resolve outstanding consequences", async () => {
    await command("change_time", {
      starts_at: "2026-09-17T00:15:00Z",
      confirmed: true,
    });
    await command("cancel", { confirmed: true });
    const p = await projection();
    expect(p.event.lifecycle).toBe("CANCELLED");
    expect(p.cases[0].disposition).toBe("OPEN_UNRESOLVED");
    expect(
      p.audit.some((x: any) => x.audit_kind === "participant_response"),
    ).toBe(true);
    expect(p.audit.some((x: any) => x.audit_kind === "cancel")).toBe(true);
  });
});

it("keeps dismissal, exception and expired participant authority distinct", async () => {
  await asHost();
  const fresh = await command("create_fixture");
  event = fresh.event_id;
  version = 1;
  await command("publish");
  await command("change_time", {
    confirmed: true,
    starts_at: "2026-09-16T23:30:00Z",
  });
  await command("dismiss", {
    confirmed: true,
    reason: "Awareness-only change for this test",
  });
  expect((await projection()).cases).toHaveLength(0);
  await command("change_time", {
    confirmed: true,
    starts_at: "2026-09-17T00:00:00Z",
  });
  await command("accept", { confirmed: true });
  const p = await projection(),
    c = p.cases[0],
    token = randomBytes(32).toString("hex");
  await command("issue_link", { participant_id: p.participants[0].id, token });
  await sql(
    "update sontu_private.event_participants set token_expires_at=now()-interval '1 minute' where id=$1",
    [p.participants[0].id],
  );
  expect((await response(token)).error_code).toBe("TOKEN_EXPIRED");
  await command("cosmetic_edit", {
    description: "A harmless spelling correction.",
  });
  expect((await projection()).cases[0].id).toBe(c.id);
  await command("exception", {
    confirmed: true,
    case_id: c.id,
    row_version: c.row_version,
    reason: "Unable to establish remaining responses",
  });
  expect((await projection()).cases[0].disposition).toBe("EXCEPTION");
  await asHost("");
  expect((await command("create_fixture")).error_code).toBe("UNAUTHORIZED");
  await asHost();
});

it("creates empty personal drafts, validates publication and preserves versioned configuration", async () => {
  await asHost();
  const op = randomUUID();
  const created = await command("create_draft", {}, 1, op);
  expect(created.status).toBe("ready");
  event = created.event_id;
  version = created.current_version;
  let p = await projection();
  expect(p.event.event_kind).toBe("SIMPLE");
  expect(p.participants).toEqual([]);
  expect((await command("publish", { confirmed: true })).error_code).toBe(
    "PUBLISH_BLOCKED",
  );
  const input = {
    title: "A birthday dinner",
    description: "Bring a story.",
    starts_at: "2030-09-16T23:00:00Z",
    ends_at: "2030-09-17T01:00:00Z",
    timezone: "America/Vancouver",
    venue_label: "Private garden",
    cover_key: "sunset",
    capacity: "8",
  };
  expect(
    (await command("save_draft", { ...input, capacity: "0" })).error_code,
  ).toBe("INVALID_INPUT");
  expect(
    (await command("save_draft", { ...input, timezone: "Invented/Zone" }))
      .error_code,
  ).toBe("INVALID_INPUT");
  expect(
    (await command("save_draft", { ...input, ends_at: input.starts_at }))
      .error_code,
  ).toBe("INVALID_INPUT");
  const savedOp = randomUUID(),
    before = version;
  const saved = await command("save_draft", input, before, savedOp);
  expect(saved.status).toBe("ready");
  expect(await command("save_draft", input, before, savedOp)).toEqual(saved);
  expect((await command("save_draft", input, before)).error_code).toBe(
    "STALE_CONFLICT",
  );
  await asHost(stranger);
  expect((await command("save_draft", input)).status).toBe("denied");
  await asHost();
  expect((await command("publish")).error_code).toBe("PUBLISH_BLOCKED");
  expect((await command("publish", { confirmed: true })).status).toBe("ready");
  expect((await command("save_draft", input)).error_code).toBe("INVALID_STATE");
  expect(
    (
      await command("change_time", {
        confirmed: true,
        starts_at: "2030-09-16T23:30:00Z",
      })
    ).status,
  ).toBe("ready");
  p = await projection();
  expect(p.version.cover_key).toBe("sunset");
  expect(p.version.capacity).toBe(8);
  expect(p.participants).toEqual([]);
  expect(p.cases).toEqual([]);
});

it("requires recipient email verification, enforces capacity and keeps invitations distinct from reconfirmation", async () => {
  await asHost();
  const created = await command(
    "create_draft",
    { timezone: "Asia/Ho_Chi_Minh" },
    1,
  );
  expect(created.status).toBe("ready");
  event = created.event_id;
  version = created.current_version;
  expect((await projection()).version.timezone).toBe("Asia/Ho_Chi_Minh");
  await command("save_draft", {
    title: "Named invitations",
    description: "Only verified recipients",
    starts_at: "2030-10-16T23:00:00Z",
    ends_at: "2030-10-17T01:00:00Z",
    timezone: "Asia/Ho_Chi_Minh",
    venue_label: "Protected garden",
    cover_key: "none",
    capacity: "1",
  });
  await command("publish", { confirmed: true });
  const token = randomBytes(32).toString("hex"),
    token2 = randomBytes(32).toString("hex");
  expect(
    (
      await command("invite_participant", {
        display_name: "Alice",
        email: "Alice@Sontu.example",
        token,
      })
    ).status,
  ).toBe("ready");
  expect(
    (
      await command("invite_participant", {
        display_name: "Bob",
        email: "bob@sontu.example",
        token: token2,
      })
    ).status,
  ).toBe("ready");
  expect(
    (await projection()).participants.every(
      (p: any) => p.commitment_state === "NO_COMMITMENT",
    ),
  ).toBe(true);
  expect(
    (
      await command("invite_participant", {
        display_name: "Duplicate",
        email: "alice@sontu.example",
        token: randomBytes(32).toString("hex"),
      })
    ).error_code,
  ).toBe("ALREADY_INVITED");
  async function access(
    t = token,
    decision: string | null = null,
    op = randomUUID(),
    expected = version,
  ) {
    return (
      await sql<{ r: any }>(
        "select public.sontu_simple_access($1,null,$2,$3,$4) r",
        [t, decision, expected, op],
      )
    )[0].r;
  }
  await asHost("");
  expect((await access()).error_code).toBe("VERIFY_EMAIL");
  expect((await response(token)).error_code).toBe("VERIFY_EMAIL");
  await sql(
    "update auth.users set email='wrong@sontu.example',email_confirmed_at=now() where id=$1",
    [stranger],
  );
  await asHost(stranger);
  expect((await access()).error_code).toBe("INVITATION_UNAVAILABLE");
  expect((await response(token)).error_code).toBe("INVITATION_UNAVAILABLE");
  await sql(
    "update auth.users set email='alice@sontu.example',email_confirmed_at=null where id=$1",
    [stranger],
  );
  expect((await access()).error_code).toBe("VERIFY_EMAIL");
  await sql("update auth.users set email_confirmed_at=now() where id=$1", [
    stranger,
  ]);
  const initial = await access();
  expect(initial.event.title).toBe("Named invitations");
  expect(initial.participant.commitment_state).toBe("NO_COMMITMENT");
  expect(initial.participants).toBeUndefined();
  const op = randomUUID();
  const accepted = await access(token, "ACCEPT_INVITE", op);
  expect(accepted.status).toBe("ready");
  expect(await access(token, "ACCEPT_INVITE", op)).toEqual(accepted);
  const mine = (await sql<{ r: any }>("select public.sontu_my_events() r"))[0].r
    .events;
  expect(mine[0].commitment_state).toBe("CONFIRMED");
  expect(mine[0].hosting).toBe(false);
  await sql("update auth.users set email='bob@sontu.example' where id=$1", [
    stranger,
  ]);
  expect((await access(token2, "ACCEPT_INVITE")).error_code).toBe(
    "CAPACITY_FULL",
  );
  await asHost();
  await command("change_time", {
    confirmed: true,
    starts_at: "2030-10-16T23:30:00Z",
  });
  await command("accept", { confirmed: true });
  let p = await projection();
  expect(
    p.participants.filter((p: any) => p.response === "AWAITING_RESPONSE"),
  ).toHaveLength(1);
  await sql("update auth.users set email='alice@sontu.example' where id=$1", [
    stranger,
  ]);
  await asHost(stranger);
  expect(
    (await access(token, "RECONFIRMED", randomUUID(), version - 1)).error_code,
  ).toBe("STALE_CONFLICT");
  expect((await access(token, "WITHDRAW")).status).toBe("ready");
  await asHost();
  expect((await projection()).cases[0].disposition).toBe("RESOLVED");
  await asHost(stranger);
  await sql("update auth.users set email='bob@sontu.example' where id=$1", [
    stranger,
  ]);
  expect((await access(token2, "ACCEPT_INVITE")).status).toBe("ready");
  await asHost();
  p = await projection();
  const bob = p.participants.find(
    (p: any) => p.invitation_email === "bob@sontu.example",
  );
  await command("revoke_link", { participant_id: bob.id });
  await asHost(stranger);
  expect((await access(token2)).error_code).toBe("INVITATION_UNAVAILABLE");
  await asHost();
  expect(
    (await projection()).participants.find((p: any) => p.id === bob.id)
      .commitment_state,
  ).toBe("CONFIRMED");
});

describe("minimum profile and immutable account identity", () => {
  it("resumes creation, isolates profiles, and enforces handles and cooldown in the database", async () => {
    await asHost(host);
    const call = async (action: string, input: object = {}) =>
      (
        await sql<{ r: any }>("select public.sontu_account_profile($1,$2) r", [
          action,
          JSON.stringify(input),
        ])
      )[0].r;
    expect((await call("read")).status).toBe("empty");
    const first = await call("create", { first_name: "Thịnh" });
    expect(first.profile.handle).toMatch(/^[a-z0-9][a-z0-9_.]{2,29}$/);
    expect((await call("create", { first_name: "Different" })).profile).toEqual(
      first.profile,
    );
    const selected = await call("update", {
      first_name: "Thịnh",
      display_name: "Jay",
      handle: "captain_j",
      revision: 1,
    });
    expect(selected.profile.user_id).toBe(host);
    expect(selected.profile.handle_provisional).toBe(false);
    expect(
      (
        await call("update", {
          first_name: "Jay",
          handle: "another_j",
          revision: 2,
        })
      ).error_code,
    ).toBe("HANDLE_COOLDOWN");
    await asHost(stranger);
    expect((await call("read")).status).toBe("empty");
    await call("create", { first_name: "Jay" });
    expect(
      (
        await call("update", {
          first_name: "Jay",
          handle: "CAPTAIN_J",
          revision: 1,
        })
      ).error_code,
    ).toBe("HANDLE_UNAVAILABLE");
    expect(
      (
        await call("update", {
          first_name: "Jay",
          handle: "admin",
          revision: 1,
        })
      ).error_code,
    ).toBe("INVALID_HANDLE");
    await asHost("");
    expect((await call("read")).status).toBe("denied");
  });
});

describe("reviewed published schedule and location", () => {
  it("revalidates authority, confirmation, dates and versions; preserves history and retry identity", async () => {
    await asHost();
    const created = await command("create_draft", {
      timezone: "America/Toronto",
    });
    event = created.event_id;
    version = created.current_version;
    await command("save_draft", {
      title: "Schedule review",
      description: "Original details",
      starts_at: "2030-09-16T22:00:00Z",
      ends_at: "2030-09-17T00:00:00Z",
      timezone: "America/Toronto",
      venue_label: "Garden",
      cover_key: "sunset",
      capacity: "8",
    });
    await command("publish", { confirmed: true });
    const initial = await projection();
    const input = {
      starts_at: "2030-09-17T22:00:00Z",
      ends_at: "2030-09-18T01:00:00Z",
      venue_label: "Terrace",
      confirmed: true,
    };
    await asHost(stranger);
    expect((await command("change_schedule", input)).error_code).toBe(
      "UNAUTHORIZED",
    );
    await asHost();
    expect(
      (await command("change_schedule", { ...input, confirmed: false }))
        .error_code,
    ).toBe("INVALID_CONFIRMATION");
    for (const invalid of [
      { ends_at: input.starts_at },
      { starts_at: "infinity" },
      { venue_label: " " },
      { starts_at: "2000-01-01T00:00:00Z" },
      { ends_at: null },
    ]) {
      expect(
        (await command("change_schedule", { ...input, ...invalid })).error_code,
      ).toBe("INVALID_INPUT");
    }
    expect((await projection()).versions).toHaveLength(initial.versions.length);
    const expected = version,
      op = randomUUID();
    const saved = await command("change_schedule", input, expected, op);
    expect(saved.status).toBe("ready");
    expect(await command("change_schedule", input, expected, op)).toEqual(
      saved,
    );
    expect(
      (
        await command(
          "change_schedule",
          { ...input, venue_label: "Stale overwrite" },
          expected,
        )
      ).error_code,
    ).toBe("STALE_CONFLICT");
    const changed = await projection();
    expect(changed.version.venue_label).toBe("Terrace");
    expect(changed.version.timezone).toBe("America/Toronto");
    expect(changed.version.cover_key).toBe("sunset");
    expect(changed.version.capacity).toBe(8);
    expect(changed.versions).toHaveLength(initial.versions.length + 1);
    expect(
      changed.versions.find((v: any) => v.id === initial.version.id),
    ).toEqual(initial.version);
    expect(changed.cases).toHaveLength(0);
    expect(changed.suggestion.suggestion_state).toBe("NONE");
    expect((await command("change_schedule", input)).error_code).toBe(
      "INVALID_INPUT",
    );
  });
  it("suggests reconfirmation for a venue change, carries an accepted obligation to later end-time changes, and does not escalate cosmetic edits", async () => {
    await sql(
      "insert into sontu_private.event_participants(event_instance_id,display_name,commitment_state) values($1,'Committed test guest','CONFIRMED')",
      [event],
    );
    const current = (await projection()).version;
    const input = {
      starts_at: current.starts_at,
      ends_at: current.ends_at,
      venue_label: "Indoor room",
      confirmed: true,
    };
    expect((await command("change_schedule", input)).status).toBe("ready");
    let p = await projection();
    expect(p.suggestion.suggestion_state).toBe("SUGGESTED");
    expect(p.cases).toHaveLength(0);
    await command("accept", { confirmed: true });
    p = await projection();
    const originalCase = p.cases[0].id;
    expect(p.participants[0].response).toBe("AWAITING_RESPONSE");
    await command("change_schedule", {
      ...input,
      ends_at: "2030-09-18T02:00:00Z",
    });
    p = await projection();
    expect(p.cases).toHaveLength(2);
    expect(p.cases.find((c: any) => c.id === originalCase).disposition).toBe(
      "SUPERSEDED",
    );
    expect(
      p.cases.find((c: any) => c.predecessor_case_id === originalCase)
        .disposition,
    ).toBe("OPEN_UNRESOLVED");
    expect(p.participants[0].response).toBe("AWAITING_RESPONSE");
    await command("cosmetic_edit", { description: "Wording only" });
    expect((await projection()).cases).toEqual(p.cases);
    await command("cancel", { confirmed: true });
    expect(
      (
        await command("change_schedule", {
          ...input,
          venue_label: "No longer editable",
        })
      ).error_code,
    ).toBe("INVALID_STATE");
  });
});

describe("event-scoped team and role privacy", () => {
  it("separates operational role, attendance and public badge visibility", async () => {
    await asHost();
    await sql("update auth.users set email='owner@sontu.test' where id=$1",[host]);
    await sql("update auth.users set email='teammate@sontu.test',email_confirmed_at=now() where id=$1",[stranger]);
    const added=(await sql<{r:any}>("select public.sontu_team_command('add_member',$1,null,$2,$3) r",[event,randomUUID(),JSON.stringify({email:"teammate@sontu.test",role:"VOLUNTEER",attends_event:true,public_visibility:"EVENT_TEAM"})]))[0].r;
    expect(added.status).toBe("ready");
    let team=(await sql<{r:any}>("select public.sontu_team_projection($1) r",[event]))[0].r;
    expect(team.members[0]).toMatchObject({role:"VOLUNTEER",attends_event:true,public_visibility:"EVENT_TEAM"});
    await sql("select public.sontu_team_command('update_member',$1,$2,$3,$4)",[event,added.item_id,randomUUID(),JSON.stringify({attends_event:false,public_visibility:"HIDDEN"})]);
    team=(await sql<{r:any}>("select public.sontu_team_projection($1) r",[event]))[0].r;
    expect(team.members[0]).toMatchObject({role:"VOLUNTEER",attends_event:false,public_visibility:"HIDDEN"});
    const todo=(await sql<{r:any}>("select public.sontu_event_operations_command('add_todo',$1,null,$2,$3) r",[event,randomUUID(),JSON.stringify({title:"Set signs"})]))[0].r;
    expect((await sql<{r:any}>("select public.sontu_assign_operation_item('todo',$1,$2,$3,$4) r",[event,todo.item_id,added.item_id,randomUUID()]))[0].r.status).toBe("ready");
    expect((await sql<{r:any}>("select public.sontu_event_operations_projection($1) r",[event]))[0].r.todos.find((x:any)=>x.id===todo.item_id).assignee_team_member_id).toBe(added.item_id);
    await asHost(stranger);
    expect((await sql<{r:any}>("select public.sontu_team_projection($1) r",[event]))[0].r.error_code).toBe("UNAUTHORIZED");
    expect((await sql<{r:any}>("select public.sontu_event_operations_projection($1) r",[event]))[0].r.status).toBe("ready");
    await asHost();
  });
});

describe("auditable event check-in", () => {
  it("admits once, reports duplicates, rejects wrong-event use and permits check-in staff", async () => {
    await asHost();
    const created=await command("create_draft",{timezone:"America/Toronto"}); event=created.event_id; version=created.current_version;
    await command("save_draft",{title:"Check-in test",description:"Admission test",starts_at:"2030-10-01T22:00:00Z",ends_at:"2030-10-02T00:00:00Z",timezone:"America/Toronto",venue_label:"Door A",cover_key:"sunset",capacity:"20"});
    await command("publish",{confirmed:true});
    const guest=randomUUID(); await sql("insert into sontu_private.event_participants(id,event_instance_id,display_name,commitment_state) values($1,$2,'Taylor Guest','CONFIRMED')",[guest,event]);
    await sql("update auth.users set email='teammate@sontu.test' where id=$1",[stranger]);
    await sql("select public.sontu_team_command('add_member',$1,null,$2,$3)",[event,randomUUID(),JSON.stringify({email:"teammate@sontu.test",role:"CHECK_IN_STAFF",attends_event:false,public_visibility:"HIDDEN"})]);
    await asHost(stranger);
    expect((await sql<{r:any}>("select public.sontu_check_in_projection($1) r",[event]))[0].r.counts).toEqual({eligible:1,admitted:0});
    const first=(await sql<{r:any}>("select public.sontu_check_in_command($1,$2,$3) r",[event,guest,randomUUID()]))[0].r;
    expect(first.result).toBe("ADMITTED");
    const duplicate=(await sql<{r:any}>("select public.sontu_check_in_command($1,$2,$3) r",[event,guest,randomUUID()]))[0].r;
    expect(duplicate.result).toBe("ALREADY_USED");
    expect((await sql<{r:any}>("select public.sontu_check_in_command($1,$2,$3) r",[event,randomUUID(),randomUUID()]))[0].r.result).toBe("INVALID");
    expect((await sql<{count:number}>("select count(*)::int count from sontu_private.audit_entries where event_instance_id=$1 and audit_kind='CHECK_IN_ATTEMPT'",[event]))[0].count).toBe(3);
    await asHost();
  });
});

describe("explicit beta dev notes", () => {
  it("keeps notes private to their author and rejects impersonation", async () => {
    await asHost();
    await db.exec("set role authenticated");
    try {
      const id = randomUUID();
      await sql(
        "insert into public.sontu_dev_notes(id,body,screen) values($1,'Improve spacing','hosting')",
        [id],
      );
      expect(
        await sql("select body from public.sontu_dev_notes where id=$1", [id]),
      ).toEqual([{ body: "Improve spacing" }]);
      await asHost(stranger);
      expect(
        await sql("select body from public.sontu_dev_notes where id=$1", [id]),
      ).toEqual([]);
      await expect(
        sql(
          "insert into public.sontu_dev_notes(id,user_id,body,screen) values($1,$2,'Wrong owner','home')",
          [randomUUID(), host],
        ),
      ).rejects.toThrow();
      await expect(
        sql(
          "insert into public.sontu_dev_notes(id,body,screen) values($1,'Secret path','/invite/private-token')",
          [randomUUID()],
        ),
      ).rejects.toThrow();
      await asHost("");
      await expect(
        sql(
          "insert into public.sontu_dev_notes(id,body,screen) values($1,'Signed out','home')",
          [randomUUID()],
        ),
      ).rejects.toThrow();
    } finally {
      await db.exec("reset role");
      await asHost();
    }
  });
});
