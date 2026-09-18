// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
  await sql(
    "insert into auth.users(id,email) values($1,'host@example.com'),($2,'member@example.com')",
    [host, stranger],
  );
  const rootDir = existsSync(resolve(process.cwd(), "supabase/migrations"))
    ? process.cwd()
    : resolve(process.cwd(), "../..");
  const dir = resolve(rootDir, "supabase/migrations");
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
    const replacementToken = randomBytes(32).toString("hex");
    await command("issue_link", {
      participant_id: p.participants[0].id,
      token: replacementToken,
    });
    expect((await response(token)).error_code).toBe("TOKEN_INVALID");
    expect((await response(replacementToken)).status).toBe("ready");
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
      await sql<{ status: string }>(
        "select distinct status from sontu_private.event_admissions where event_instance_id=$1 order by status",
        [event],
      ),
    ).toEqual([{ status: "CANCELLED_EVENT_INVALID" }]);
    expect(
      p.admission_summary,
    ).toMatchObject({ valid: 0, invalid: 12 });
    expect(
      p.audit.some((x: any) => x.audit_kind === "participant_response"),
    ).toBe(true);
    expect(p.audit.some((x: any) => x.audit_kind === "cancel")).toBe(true);
  });

  it("keeps host admission metrics event-scoped for managers, not door staff", async () => {
    await sql(
      "insert into sontu_private.event_team_members(event_instance_id,user_id,role) values($1,$2,'EVENT_MANAGER') on conflict(event_instance_id,user_id) do update set role=excluded.role",
      [event, stranger],
    );
    await asHost(stranger);
    expect(
      (
        await sql<{ r: any }>(
          "select public.sontu_host_operational_analytics($1) r",
          [event],
        )
      )[0].r.status,
    ).toBe("ready");
    expect(
      (
        await sql<{ r: any }>(
          "select public.sontu_host_credential_lifecycle_projection($1) r",
          [event],
        )
      )[0].r.status,
    ).toBe("ready");
    expect(
      (
        await sql<{ r: any }>(
          "select public.sontu_event_team_hub_action($1) r",
          [event],
        )
      )[0].r,
    ).toMatchObject({ status: "ready", action: "OPERATIONS", role: "EVENT_MANAGER" });
    await sql(
      "update sontu_private.event_team_members set role='CHECK_IN_STAFF' where event_instance_id=$1 and user_id=$2",
      [event, stranger],
    );
    expect(
      (
        await sql<{ r: any }>(
          "select public.sontu_host_operational_analytics($1) r",
          [event],
        )
      )[0].r.error_code,
    ).toBe("UNAUTHORIZED");
    expect(
      (
        await sql<{ r: any }>(
          "select public.sontu_host_credential_lifecycle_projection($1) r",
          [event],
        )
      )[0].r.error_code,
    ).toBe("UNAUTHORIZED");
    await asHost();
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
  expect(
    await sql(
      "select owner_kind,personal_user_id from sontu_private.event_owner_contexts where event_instance_id=$1",
      [event],
    ),
  ).toEqual([{ owner_kind: "PERSONAL", personal_user_id: host }]);
  const organizationOperation = randomUUID();
  await sql("update auth.users set email_confirmed_at=now() where id=$1", [
    stranger,
  ]);
  const organizationInput = {
    display_name: "Test Community",
    organization_type: "COMMUNITY",
    description: "Local gatherings",
    visibility: "PUBLIC",
    successor_email: "member@example.com",
  };
  const organization = (
    await sql<{ r: any }>("select public.sontu_organization_setup($1,$2) r", [
      JSON.stringify(organizationInput),
      organizationOperation,
    ])
  )[0].r;
  expect(organization.status).toBe("ready");
  expect(
    (
      await sql<{ r: any }>("select public.sontu_organization_setup($1,$2) r", [
        JSON.stringify(organizationInput),
        organizationOperation,
      ])
    )[0].r,
  ).toEqual(organization);
  expect(organization.organization).toMatchObject({
    organization_type: "COMMUNITY",
    description: "Local gatherings",
    visibility: "PUBLIC",
    lifecycle: "SETUP_INCOMPLETE",
    successor_status: "PENDING",
  });
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_event_owner($1,'ORGANIZATION',$2) r",
        [event, organization.organization.id],
      )
    )[0].r.error_code,
  ).toBe("ORGANIZATION_NOT_ACTIVE");
  await asHost(stranger);
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_organization_governance('respond_successor',$1,$2,$3) r",
        [
          organization.organization.id,
          JSON.stringify({ decision: "ACCEPT" }),
          randomUUID(),
        ],
      )
    )[0].r.status,
  ).toBe("ready");
  await asHost();
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_event_owner($1,'ORGANIZATION',$2) r",
        [event, organization.organization.id],
      )
    )[0].r.owner_name,
  ).toBe("Test Community");
  const organizationId = organization.organization.id;
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_organization_governance('update',$1,$2,$3) r",
        [
          organizationId,
          JSON.stringify({
            ...organizationInput,
            display_name: "Test Community Society",
          }),
          randomUUID(),
        ],
      )
    )[0].r.status,
  ).toBe("ready");
  const logoOperation = randomUUID();
  const logoPath = `${host}/organizations/logo-test.webp`;
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_organization_logo('write',$1,$2,$3) r",
        [organizationId, logoPath, logoOperation],
      )
    )[0].r,
  ).toMatchObject({ status: "ready", logo_path: logoPath });
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_organization_logo('write',$1,$2,$3) r",
        [organizationId, logoPath, logoOperation],
      )
    )[0].r,
  ).toMatchObject({ status: "ready", logo_path: logoPath });
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_organization_logo('overview',null,null,null) r",
      )
    )[0].r.logos,
  ).toContainEqual({ organization_id: organizationId, logo_path: logoPath });
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_organization_logo('write',$1,$2,$3) r",
        [
          organizationId,
          `${stranger}/organizations/not-owned.webp`,
          randomUUID(),
        ],
      )
    )[0].r.error_code,
  ).toBe("INVALID_INPUT");
  await asHost(stranger);
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_organization_logo('write',$1,$2,$3) r",
        [organizationId, logoPath, randomUUID()],
      )
    )[0].r.error_code,
  ).toBe("UNAUTHORIZED");
  await asHost();
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_organization_context('add_member',$1,$2,$3) r",
        [
          JSON.stringify({ email: "member@example.com", role: "MEMBER" }),
          organizationId,
          randomUUID(),
        ],
      )
    )[0].r.status,
  ).toBe("ready");
  const detail = (
    await sql<{ r: any }>(
      "select public.sontu_organization_context('detail','{}',$1,null) r",
      [organizationId],
    )
  )[0].r;
  expect(detail.members.map((member: any) => member.role)).toEqual([
    "OWNER",
    "MEMBER",
  ]);
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_organization_context('add_member',$1,$2,$3) r",
        [
          JSON.stringify({ email: "host@example.com", role: "MEMBER" }),
          organizationId,
          randomUUID(),
        ],
      )
    )[0].r.error_code,
  ).toBe("UNAUTHORIZED");
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_team_command('add_member',$1,null,$2,$3) r",
        [
          event,
          randomUUID(),
          JSON.stringify({
            email: "member@example.com",
            role: "EVENT_MANAGER",
          }),
        ],
      )
    )[0].r.status,
  ).toBe("ready");
  expect(
    (
      await sql<{ count: number }>(
        "select count(*)::int count from sontu_private.event_team_members where event_instance_id=$1",
        [event],
      )
    )[0].count,
  ).toBe(1);
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_organization_context('remove_member',$1,$2,$3) r",
        [JSON.stringify({ user_id: stranger }), organizationId, randomUUID()],
      )
    )[0].r.status,
  ).toBe("ready");
  expect(
    (
      await sql<{ count: number }>(
        "select count(*)::int count from sontu_private.event_team_members where event_instance_id=$1",
        [event],
      )
    )[0].count,
  ).toBe(0);
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_team_command('add_member',$1,null,$2,$3) r",
        [
          event,
          randomUUID(),
          JSON.stringify({
            email: "member@example.com",
            role: "EVENT_MANAGER",
          }),
        ],
      )
    )[0].r.error_code,
  ).toBe("INVALID_INPUT");
  await asHost(stranger);
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_organization_context('remove_member',$1,$2,$3) r",
        [JSON.stringify({ user_id: host }), organizationId, randomUUID()],
      )
    )[0].r.error_code,
  ).toBe("UNAUTHORIZED");
  await asHost();
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_organization_governance('retire',$1,$2,$3) r",
        [
          organizationId,
          JSON.stringify({ confirmation: "Test Community Society" }),
          randomUUID(),
        ],
      )
    )[0].r.error_code,
  ).toBe("ORGANIZATION_HAS_ACTIVE_EVENTS");
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
    cover_key: `upload:${host}/${event}/cover-test.webp`,
    capacity: "8",
  };
  expect(
    (await command("save_draft", { ...input, capacity: "0" })).error_code,
  ).toBe("INVALID_INPUT");
  expect(
    (await command("save_draft", { ...input, capacity: "25000" })).status,
  ).toBe("ready");
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
  expect(p.version.cover_key).toBe(`upload:${host}/${event}/cover-test.webp`);
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
    (await sql<{ r: any }>("select public.sontu_my_events() r"))[0].r.events[0]
      .reconfirmation_required,
  ).toBe(true);
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

it("joins and withdraws from a public event atomically with safe retries", async () => {
  const attendee = randomUUID(),
    waiting = randomUUID();
  await sql(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'public-one@example.com',now()),($2,'public-two@example.com',now())",
    [attendee, waiting],
  );
  await asHost();
  const created = await command(
    "create_draft",
    { timezone: "America/Toronto" },
    1,
  );
  event = created.event_id;
  version = created.current_version;
  await command("save_draft", {
    title: "Open garden gathering",
    description: "A public event",
    starts_at: "2031-06-20T22:00:00Z",
    ends_at: "2031-06-21T00:00:00Z",
    timezone: "America/Toronto",
    venue_label: "Community garden",
    cover_key: "market",
    capacity: "1",
  });
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_event_visibility('write',$1,'PUBLIC') r",
        [event],
      )
    )[0].r.status,
  ).toBe("ready");
  await command("publish", { confirmed: true });
  await sql("update auth.users set email_confirmed_at=now() where id=$1", [
    host,
  ]);
  const participate = async (
    action: string,
    op: string | null = action === "READ" ? null : randomUUID(),
    expected = version,
  ) =>
    (
      await sql<{ r: any }>(
        "select public.sontu_public_event_participation($1,$2,$3,$4) r",
        [event, action, expected, op],
      )
    )[0].r;

  const hostRead = await participate("READ");
  expect(hostRead.hosting).toBe(true);
  expect(hostRead.responses_open).toBe(false);
  expect((await participate("JOIN")).error_code).toBe("INVALID_STATE");

  await asHost(attendee);
  const attendeeProfile = (
    await sql<{ r: any }>("select public.sontu_account_profile($1,$2) r", [
      "create",
      JSON.stringify({ first_name: "Public One" }),
    ])
  )[0].r.profile;
  let read = await participate("READ");
  expect(read.hosting).toBe(false);
  expect(read.commitment_state).toBeNull();
  expect(
    (
      await sql<{ r: any }>("select public.sontu_event_interest($1,$2) r", [
        event,
        "READ",
      ])
    )[0].r.interested,
  ).toBe(false);
  expect(
    (
      await sql<{ r: any }>("select public.sontu_event_interest($1,$2) r", [
        event,
        "SAVE",
      ])
    )[0].r,
  ).toMatchObject({ status: "ready", interested: true });
  expect(
    (
      await sql<{ r: any }>("select public.sontu_public_events($1) r", [event])
    )[0].r.events[0].interested,
  ).toBe(true);
  expect(
    (
      await sql<{ r: any }>("select public.sontu_event_interest($1,$2) r", [
        event,
        "UNSAVE",
      ])
    )[0].r,
  ).toMatchObject({ status: "ready", interested: false });
  const joinOperation = randomUUID();
  const joined = await participate("JOIN", joinOperation);
  expect(joined.status).toBe("ready");
  expect(await participate("JOIN", joinOperation)).toEqual(joined);
  read = await participate("READ");
  expect(read.commitment_state).toBe("CONFIRMED");
  expect(read.full).toBe(true);
  expect(
    (await sql<{ r: any }>("select public.sontu_my_events() r"))[0].r.events[0]
      .commitment_state,
  ).toBe("CONFIRMED");
  expect(
    (
      await sql<{ r: any }>("select public.sontu_event_hub($1) r", [event])
    )[0].r.going.some(
      (person: any) =>
        person.display_name === "Public One" &&
        person.handle === attendeeProfile.handle,
    ),
  ).toBe(true);
  expect(
    JSON.stringify(
      (await sql<{ r: any }>("select public.sontu_event_hub($1) r", [event]))[0]
        .r.going,
    ),
  ).not.toContain("public-one@example.com");
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_event_participant_visibility($1,$2) r",
        [event, "NAME_ONLY"],
      )
    )[0].r,
  ).toMatchObject({ status: "ready", event_visibility: "NAME_ONLY" });
  let visibilityHub = (
    await sql<{ r: any }>("select public.sontu_event_hub($1) r", [event])
  )[0].r;
  expect(visibilityHub.viewer.event_visibility).toBe("NAME_ONLY");
  expect(
    visibilityHub.going.find((person: any) => person.display_name === "Public One")
      .handle,
  ).toBeNull();
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_event_participant_visibility($1,$2) r",
        [event, "HIDDEN"],
      )
    )[0].r,
  ).toMatchObject({ status: "ready", event_visibility: "HIDDEN" });
  visibilityHub = (
    await sql<{ r: any }>("select public.sontu_event_hub($1) r", [event])
  )[0].r;
  expect(visibilityHub.viewer.event_visibility).toBe("HIDDEN");
  expect(
    visibilityHub.going.some((person: any) => person.display_name === "Public One"),
  ).toBe(false);
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_public_event_participation($1,$2,$3,$4) r",
        [event, "READ", null, null],
      )
    )[0].r.commitment_state,
  ).toBe("CONFIRMED");

  await asHost(waiting);
  expect((await participate("JOIN")).error_code).toBe("CAPACITY_FULL");
  await asHost(attendee);
  expect((await participate("WITHDRAW")).status).toBe("ready");
  read = await participate("READ");
  expect(read.commitment_state).toBe("RELEASED_DECLINED");
  expect(read.full).toBe(false);
  await asHost();
  const analyticsAfterWithdraw = (
    await sql<{ r: any }>(
      "select public.sontu_host_operational_analytics($1) r",
      [event],
    )
  )[0].r;
  expect(analyticsAfterWithdraw.rsvp).toMatchObject({
    confirmed: 0,
    reserved_places: 0,
    remaining_places: 1,
    declined_or_withdrawn: 1,
  });
  expect(analyticsAfterWithdraw.admissions.invalid).toBe(1);
  await asHost(waiting);
  expect((await participate("JOIN")).status).toBe("ready");
  await asHost();
  const analyticsAfterRecovery = (
    await sql<{ r: any }>(
      "select public.sontu_host_operational_analytics($1) r",
      [event],
    )
  )[0].r;
  expect(analyticsAfterRecovery.rsvp).toMatchObject({
    confirmed: 1,
    reserved_places: 1,
    remaining_places: 0,
  });
});

it("keeps virtual join info protected until RSVP is confirmed", async () => {
  const attendee = randomUUID(),
    waiting = randomUUID(),
    guestToken = randomUUID();
  await sql(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'protected-one@example.com',now()),($2,'protected-two@example.com',now())",
    [attendee, waiting],
  );
  await asHost();
  const created = await command(
    "create_draft",
    { timezone: "America/Toronto" },
    1,
  );
  event = created.event_id;
  version = created.current_version;
  await command("save_draft", {
    title: "Protected online session",
    description: "Private link",
    starts_at: "2031-08-20T22:00:00Z",
    ends_at: "2031-08-21T00:00:00Z",
    timezone: "America/Toronto",
    venue_label: "Online access shared after RSVP",
    cover_key: "music",
    capacity: "4",
  });
  await sql("select public.sontu_set_event_intent($1,$2,$3)", [
    event,
    "Webinar",
    "online",
  ]);
  await sql("select public.sontu_event_visibility('write',$1,'PUBLIC')", [
    event,
  ]);
  await command("publish", { confirmed: true });
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_event_join_info('write',$1,$2,$3,null) r",
        [
          event,
          "Zoom https://sontu.example/secret passcode 2468",
          randomUUID(),
        ],
      )
    )[0].r.status,
  ).toBe("ready");
  await asHost(waiting);
  const waitingRead = (
    await sql<{ r: any }>(
      "select public.sontu_event_join_info('read',$1,null,null,null) r",
      [event],
    )
  )[0].r;
  expect(waitingRead.protected_join_info).toBeNull();
  expect(waitingRead.join_info_visible).toBe(false);

  await asHost(attendee);
  const joined = (
    await sql<{ r: any }>(
      "select public.sontu_public_event_participation($1,'JOIN',$2,$3) r",
      [event, version, randomUUID()],
    )
  )[0].r;
  expect(joined.status).toBe("ready");
  const attendeeRead = (
    await sql<{ r: any }>(
      "select public.sontu_event_join_info('read',$1,null,null,null) r",
      [event],
    )
  )[0].r;
  expect(attendeeRead.protected_join_info).toContain("passcode 2468");
  expect(attendeeRead.join_info_visible).toBe(true);
  const hub = (
    await sql<{ r: any }>("select public.sontu_event_hub($1) r", [event])
  )[0].r;
  expect(hub.event.title).toBe("Protected online session");

  await asHost("");
  const guestBefore = (
    await sql<{ r: any }>(
      "select public.sontu_event_join_info('read',$1,null,null,$2) r",
      [event, guestToken],
    )
  )[0].r;
  expect(guestBefore.protected_join_info).toBeNull();
  const guestJoined = (
    await sql<{ r: any }>(
      "select public.sontu_guest_event_participation($1,'JOIN','Guest Online','guest-online@example.com',$2,$3,$4) r",
      [event, version, randomUUID(), guestToken],
    )
  )[0].r;
  expect(guestJoined.status).toBe("ready");
  const guestAfter = (
    await sql<{ r: any }>(
      "select public.sontu_event_join_info('read',$1,null,null,$2) r",
      [event, guestToken],
    )
  )[0].r;
  expect(guestAfter.protected_join_info).toContain("passcode 2468");
  expect(guestAfter.join_info_visible).toBe(true);
});

it("keeps public visibility separate from guest RSVP eligibility", async () => {
  await asHost();
  const created = await command(
    "create_draft",
    { timezone: "America/Toronto" },
    1,
  );
  event = created.event_id;
  version = created.current_version;
  await command("save_draft", {
    title: "Guest-friendly gathering",
    description: "A public event with guest RSVP",
    starts_at: "2032-06-20T22:00:00Z",
    ends_at: "2032-06-21T00:00:00Z",
    timezone: "America/Toronto",
    venue_label: "Public square",
    cover_key: "sunset",
    capacity: "1",
  });
  await sql("select public.sontu_event_visibility('write',$1,'PUBLIC')", [
    event,
  ]);
  await sql(
    "select public.sontu_event_participation_access('write',$1,'SONTU_USERS_ONLY')",
    [event],
  );
  await command("publish", { confirmed: true });
  let token = randomUUID();
  const operation = randomUUID();
  const guest = async (action: string, op: string | null = null) =>
    (
      await sql<{ r: any }>(
        "select public.sontu_guest_event_participation($1,$2,$3,$4,$5,$6,$7) r",
        [
          event,
          action,
          action === "JOIN" ? "Guest One" : null,
          action === "JOIN" ? "guest@example.com" : null,
          action === "READ" ? null : version,
          op,
          token,
        ],
      )
    )[0].r;
  await sql("select set_config('request.jwt.claim.sub','',false)");
  expect((await guest("JOIN", operation)).error_code).toBe(
    "INVITATION_UNAVAILABLE",
  );
  await asHost();
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_event_participation_access('write',$1,'ANYONE') r",
        [event],
      )
    )[0].r.status,
  ).toBe("ready");
  await sql("select set_config('request.jwt.claim.sub','',false)");
  expect((await guest("JOIN", operation)).commitment_state).toBe("CONFIRMED");
  expect(
    await sql<{ audit_kind: string }>(
      "select audit_kind from sontu_private.audit_entries where event_instance_id=$1 and audit_kind='PARTICIPATION_ACCESS_CHANGED' and metadata->>'lifecycle'='PUBLISHED'",
      [event],
    ),
  ).toHaveLength(1);

  await asHost();
  token = randomUUID();
  const openCreated = await command(
    "create_draft",
    { timezone: "America/Toronto" },
    1,
  );
  event = openCreated.event_id;
  version = openCreated.current_version;
  await command("save_draft", {
    title: "Open guest gathering",
    description: "Guests welcome",
    starts_at: "2032-07-20T22:00:00Z",
    ends_at: "2032-07-21T00:00:00Z",
    timezone: "America/Toronto",
    venue_label: "Public square",
    cover_key: "sunset",
    capacity: "1",
  });
  await sql("select public.sontu_event_visibility('write',$1,'PUBLIC')", [
    event,
  ]);
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_event_participation_access('write',$1,'ANYONE') r",
        [event],
      )
    )[0].r.status,
  ).toBe("ready");
  await command("publish", { confirmed: true });
  await sql("select set_config('request.jwt.claim.sub','',false)");
  const secondOperation = randomUUID();
  const joined = await guest("JOIN", secondOperation);
  expect(joined).toMatchObject({
    status: "ready",
    commitment_state: "CONFIRMED",
    display_name: "Guest One",
  });
  expect(
    await sql<{ kind: string; state: string; is_simulated: boolean }>(
      "select c.kind,o.state,c.is_simulated from sontu_private.communication_records c join sontu_private.outbox_entries o on o.communication_id=c.id where c.event_instance_id=$1",
      [event],
    ),
  ).toEqual([
    {
      kind: "GUEST_RSVP_CONFIRMATION",
      state: "PENDING",
      is_simulated: false,
    },
  ]);
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_participant_communication_history($1,$2) r",
        [event, token],
      )
    )[0].r,
  ).toMatchObject({
    status: "ready",
    notices: [{ kind: "GUEST_RSVP_CONFIRMATION", state: "PENDING" }],
  });
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_participant_communication_history($1,$2) r",
        [event, randomUUID()],
      )
    )[0].r.error_code,
  ).toBe("INVITATION_UNAVAILABLE");
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_participant_admission_projection($1,$2) r",
        [event, token],
      )
    )[0].r.admission,
  ).toMatchObject({ status: "VALID", credential_status: "ACTIVE" });
  const recoveredToken = randomUUID();
  await sql(
    "update sontu_private.event_participants set guest_recovery_token_hash=sha256(convert_to($1::text,'UTF8')),guest_recovery_token_expires_at=now()+interval '1 hour' where event_instance_id=$2 and token_hash=sha256(convert_to($3::text,'UTF8'))",
    [recoveredToken, event, token],
  );
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_participant_admission_projection($1,$2) r",
        [event, recoveredToken],
      )
    )[0].r.admission,
  ).toMatchObject({ status: "VALID", credential_status: "ACTIVE" });
  expect(
    await sql<{ recipient_email: string; event_title: string }>(
      "select recipient_email,event_title from sontu_private.claim_guest_rsvp_email($1,$2)",
      [event, token],
    ),
  ).toEqual([
    {
      recipient_email: "guest@example.com",
      event_title: "Open guest gathering",
    },
  ]);
  expect(
    (
      await sql<{ r: any }>("select public.sontu_guest_hub_access($1,$2) r", [
        event,
        token,
      ])
    )[0].r,
  ).toMatchObject({ status: "ready", commitment_state: "CONFIRMED" });
  expect(await guest("JOIN", secondOperation)).toEqual(joined);
  expect((await guest("READ")).commitment_state).toBe("CONFIRMED");
  await asHost();
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_event_participation_access('write',$1,'SONTU_USERS_ONLY') r",
        [event],
      )
    )[0].r,
  ).toMatchObject({ status: "ready", participation_access: "SONTU_USERS_ONLY" });
  await sql("select set_config('request.jwt.claim.sub','',false)");
  expect((await guest("READ")).commitment_state).toBe("CONFIRMED");
  const blockedToken = randomUUID();
  token = blockedToken;
  expect((await guest("JOIN", randomUUID())).error_code).toBe(
    "INVITATION_UNAVAILABLE",
  );
  token = recoveredToken;
  const guestWithdrawn = await guest("WITHDRAW", randomUUID());
  expect(guestWithdrawn).toMatchObject({
    status: "ready",
    commitment_state: "RELEASED_DECLINED",
  });
  expect((await guest("READ")).commitment_state).toBe("RELEASED_DECLINED");
  await asHost();
  const guestParticipant = (
    await sql<{ id: string }>(
      "select id from sontu_private.event_participants where event_instance_id=$1 and guest_recovery_token_hash=sha256(convert_to($2::text,'UTF8'))",
      [event, recoveredToken],
    )
  )[0];
  expect(
    await sql<{ status: string }>(
      "select status from sontu_private.event_admissions where event_participant_id=$1",
      [guestParticipant.id],
    ),
  ).toEqual([{ status: "REVOKED" }]);
  {
    const credentialRows = await sql<{ status: string }>(
      "select c.status from sontu_private.event_credentials c join sontu_private.event_admissions a on a.id=c.admission_id where a.event_participant_id=$1",
      [guestParticipant.id],
    );
    expect(credentialRows.length).toBeGreaterThan(0);
    expect(credentialRows.every((row) => row.status === "REVOKED")).toBe(true);
  }
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_host_operational_analytics($1) r",
        [event],
      )
    )[0].r.rsvp,
  ).toMatchObject({
    confirmed: 0,
    reserved_places: 0,
    declined_or_withdrawn: 1,
  });
  await sql(
    "update sontu_private.event_participants set commitment_state='CONFIRMED', invitation_state='ACCEPTED' where id=$1",
    [guestParticipant.id],
  );
  await sql(
    "update sontu_private.event_admissions set status='VALID', invalidated_at=null, updated_at=now() where event_participant_id=$1",
    [guestParticipant.id],
  );
  const hostRemoved = (
    await sql<{ r: any }>(
      "select public.sontu_host_participant_rsvp($1,$2,'REJECT',$3) r",
      [event, guestParticipant.id, randomUUID()],
    )
  )[0].r;
  expect(hostRemoved).toMatchObject({
    status: "ready",
    participant_id: guestParticipant.id,
    commitment_state: "RELEASED_DECLINED",
  });
  expect(
    await sql<{ status: string }>(
      "select status from sontu_private.event_admissions where event_participant_id=$1",
      [guestParticipant.id],
    ),
  ).toEqual([{ status: "REVOKED" }]);
  {
    const credentialRows = await sql<{ status: string }>(
      "select c.status from sontu_private.event_credentials c join sontu_private.event_admissions a on a.id=c.admission_id where a.event_participant_id=$1",
      [guestParticipant.id],
    );
    expect(credentialRows.length).toBeGreaterThan(0);
    expect(credentialRows.every((row) => row.status === "REVOKED")).toBe(true);
  }
  const analyticsAfterRemoval = (
    await sql<{ r: any }>(
      "select public.sontu_host_operational_analytics($1) r",
      [event],
    )
  )[0].r;
  expect(analyticsAfterRemoval.rsvp).toMatchObject({
    confirmed: 0,
    reserved_places: 0,
    declined_or_withdrawn: 1,
  });
  expect(analyticsAfterRemoval.admissions.invalid).toBe(1);
  expect(
    ((await sql<{ r: any }>("select public.sontu_event_hub($1) r", [event]))[0]
      .r.going as { display_name: string }[]).some(
      (person) => person.display_name === "Guest One",
    ),
  ).toBe(false);
  await sql("select set_config('request.jwt.claim.sub','',false)");
  expect((await guest("READ")).commitment_state).toBe(
    "RELEASED_DECLINED",
  );
});

it("keeps unlisted events out of discovery while allowing direct-link guest RSVP", async () => {
  await asHost();
  const expiredPublic = randomUUID();
  await sql(
    `insert into sontu_private.event_instances(id,host_owner_user_id,lifecycle,event_kind,visibility,event_category,event_format)
     values($1,$2,'PUBLISHED','SIMPLE','PUBLIC','Past','in-person')`,
    [expiredPublic, host],
  );
  await sql(
    `insert into sontu_private.event_versions(event_instance_id,version_number,title,description,starts_at,ends_at,timezone,venue_label,cover_key,materiality_class,created_by)
     values($1,1,'Expired public event','Should not appear in discovery','2020-01-01T20:00:00Z','2020-01-01T22:00:00Z','America/Toronto','Past venue','sunset','INITIAL',$2)`,
    [expiredPublic, host],
  );
  await asHost("");
  expect(
    (
      await sql<{ r: any }>("select public.sontu_public_events() r")
    )[0].r.events.some((item: any) => item.id === expiredPublic),
  ).toBe(false);
  expect(
    (
      await sql<{ r: any }>("select public.sontu_public_events($1) r", [
        expiredPublic,
      ])
    )[0].r.events[0],
  ).toMatchObject({ id: expiredPublic, title: "Expired public event" });
  await asHost();
  const created = await command(
    "create_draft",
    { timezone: "America/Toronto" },
    1,
  );
  event = created.event_id;
  version = created.current_version;
  await command("save_draft", {
    title: "Unlisted supper",
    description: "Direct-link only",
    starts_at: "2032-09-20T22:00:00Z",
    ends_at: "2032-09-21T00:00:00Z",
    timezone: "America/Toronto",
    venue_label: "Shared table",
    cover_key: "food",
    capacity: "8",
  });
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_event_visibility('write',$1,'UNLISTED') r",
        [event],
      )
    )[0].r.visibility,
  ).toBe("UNLISTED");
  await command("publish", { confirmed: true });
  await sql("select set_config('request.jwt.claim.sub','',false)");
  expect(
    (
      await sql<{ r: any }>("select public.sontu_public_events() r")
    )[0].r.events.some((item: any) => item.id === event),
  ).toBe(false);
  expect(
    (
      await sql<{ r: any }>("select public.sontu_public_events($1) r", [event])
    )[0].r.events[0],
  ).toMatchObject({ id: event, visibility: "UNLISTED" });
  const token = randomUUID();
  expect(
    (
      await sql<{ r: any }>(
        "select public.sontu_guest_event_participation($1,'JOIN','Link Guest','link@example.com',$2,$3,$4) r",
        [event, version, randomUUID(), token],
      )
    )[0].r.commitment_state,
  ).toBe("CONFIRMED");
});

it("keeps event access surfaces scoped by visibility and relationship", async () => {
  const owner = randomUUID(),
    participantUser = randomUUID(),
    unrelatedUser = randomUUID(),
    publicEvent = randomUUID(),
    privateEvent = randomUUID(),
    unlistedEvent = randomUUID();
  await sql(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'matrix-host@example.com',now()),($2,'matrix-participant@example.com',now()),($3,'matrix-unrelated@example.com',now())",
    [owner, participantUser, unrelatedUser],
  );
  await sql(
    `insert into sontu_private.event_instances(id,host_owner_user_id,lifecycle,event_kind,visibility,event_category,event_format)
     values
      ($1,$2,'PUBLISHED','SIMPLE','PUBLIC','Public matrix','in-person'),
      ($3,$2,'PUBLISHED','SIMPLE','PRIVATE','Private matrix','in-person'),
      ($4,$2,'PUBLISHED','SIMPLE','UNLISTED','Unlisted matrix','online')`,
    [publicEvent, owner, privateEvent, unlistedEvent],
  );
  await sql(
    `insert into sontu_private.event_versions(event_instance_id,version_number,title,description,starts_at,ends_at,timezone,venue_label,cover_key,materiality_class,created_by)
     values
      ($1,1,'Public matrix event','Visible in discovery','2032-11-01T20:00:00Z','2032-11-01T22:00:00Z','America/Toronto','Public venue','music','INITIAL',$4),
      ($2,1,'Private matrix event','Participant only','2032-11-02T20:00:00Z','2032-11-02T22:00:00Z','America/Toronto','Private venue','food','INITIAL',$4),
      ($3,1,'Unlisted matrix event','Direct link only','2032-11-03T20:00:00Z','2032-11-03T22:00:00Z','America/Toronto','Unlisted venue','market','INITIAL',$4)`,
    [publicEvent, privateEvent, unlistedEvent, owner],
  );
  await sql(
    "insert into sontu_private.event_participants(event_instance_id,participant_user_id,display_name,commitment_state,invitation_state) values($1,$2,'Matrix Participant','CONFIRMED','ACCEPTED')",
    [privateEvent, participantUser],
  );

  await asHost("");
  const discovery = (
    await sql<{ r: any }>("select public.sontu_public_events() r")
  )[0].r.events;
  expect(discovery.some((item: any) => item.id === publicEvent)).toBe(true);
  expect(discovery.some((item: any) => item.id === privateEvent)).toBe(false);
  expect(discovery.some((item: any) => item.id === unlistedEvent)).toBe(false);
  expect(
    (
      await sql<{ r: any }>("select public.sontu_public_events($1) r", [
        unlistedEvent,
      ])
    )[0].r.events[0],
  ).toMatchObject({ id: unlistedEvent, title: "Unlisted matrix event" });
  expect(
    (
      await sql<{ r: any }>("select public.sontu_public_events($1) r", [
        privateEvent,
      ])
    )[0].r.events,
  ).toEqual([]);

  await asHost(unrelatedUser);
  expect(
    (
      await sql<{ r: any }>("select public.sontu_event_hub($1) r", [
        privateEvent,
      ])
    )[0].r.error_code,
  ).toBe("INVITATION_UNAVAILABLE");

  await asHost(participantUser);
  expect(
    (
      await sql<{ r: any }>("select public.sontu_event_hub($1) r", [
        privateEvent,
      ])
    )[0].r,
  ).toMatchObject({
    status: "ready",
    event: { id: privateEvent, title: "Private matrix event" },
    viewer: { hosting: false, commitment_state: "CONFIRMED" },
  });

  await asHost(owner);
  expect(
    (
      await sql<{ r: any }>("select public.sontu_event_hub($1) r", [
        privateEvent,
      ])
    )[0].r.viewer.hosting,
  ).toBe(true);
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
    expect(first.profile.event_email_enabled).toBe(true);
    expect((await call("create", { first_name: "Different" })).profile).toEqual(
      first.profile,
    );
    const selected = await call("update", {
      first_name: "Thịnh",
      display_name: "Jay",
      handle: "captain_j",
      event_email_enabled: false,
      revision: 1,
    });
    expect(selected.profile.user_id).toBe(host);
    expect(selected.profile.handle_provisional).toBe(false);
    expect(selected.profile.event_email_enabled).toBe(false);
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

describe("account event email preferences", () => {
  it("suppresses pending account event email when the participant opted out", async () => {
    await asHost();
    await sql(
      `insert into sontu_private.account_profiles(user_id,first_name,handle,event_email_enabled)
       values($1,'Opted Out','opted_out_test',false)
       on conflict(user_id) do update set event_email_enabled=false`,
      [stranger],
    );
    const created = await command("create_draft", {
      timezone: "America/Toronto",
    });
    event = created.event_id;
    version = created.current_version;
    await command("save_draft", {
      title: "Preference email test",
      description: "Preference test",
      starts_at: "2032-03-01T20:00:00Z",
      ends_at: "2032-03-01T22:00:00Z",
      timezone: "America/Toronto",
      venue_label: "Room P",
      cover_key: "market",
      capacity: "12",
    });
    await command("publish", { confirmed: true });
    const participant = randomUUID();
    await sql(
      `insert into sontu_private.event_participants(
        id,event_instance_id,participant_user_id,display_name,invitation_email,commitment_state
      ) values($1,$2,$3,'Opted Out','opted@example.com','CONFIRMED')`,
      [participant, event, stranger],
    );
    const communication = (
      await sql<{ id: string }>(
        `insert into sontu_private.communication_records(event_instance_id,participant_id,kind)
         values($1,$2,'EVENT_CHANGE') returning id`,
        [event, participant],
      )
    )[0].id;
    await sql(
      "insert into sontu_private.outbox_entries(event_instance_id,communication_id) values($1,$2)",
      [event, communication],
    );
    expect(
      await sql("select * from sontu_private.claim_event_email_outbox($1,25)", [
        event,
      ]),
    ).toEqual([]);
    expect(
      await sql(
        `select o.state,c.dispatch_state,o.last_error
         from sontu_private.outbox_entries o
         join sontu_private.communication_records c on c.id=o.communication_id
         where o.communication_id=$1`,
        [communication],
      ),
    ).toEqual([
      {
        state: "SUPPRESSED",
        dispatch_state: "SUPPRESSED",
        last_error: "Recipient disabled account event email.",
      },
    ]);
  });
});

describe("public profile hubs", () => {
  it("resolves handles without exposing private account or relationship data", async () => {
    const owner = randomUUID();
    await sql("insert into auth.users(id,email) values($1,$2)", [
      owner,
      "profile-owner@example.com",
    ]);
    await asHost(owner);
    const created = (
      await sql<{ r: any }>("select public.sontu_account_profile($1,$2) r", [
        "create",
        JSON.stringify({ first_name: "Profile", event_email_enabled: false }),
      ])
    )[0].r;
    const handle = created.profile.handle;
    await sql("select set_config('request.jwt.claim.sub','',false)");
    await db.exec("set role anon");
    try {
      const hub = (
        await sql<{ r: any }>("select public.sontu_public_profile_hub($1) r", [
          handle,
        ])
      )[0].r;
      expect(hub).toMatchObject({
        status: "ready",
        viewer: { owner: false, close: false, connection_status: "none" },
        profile: { display_name: "Profile", handle },
      });
      expect(JSON.stringify(hub)).not.toContain("email");
      expect(JSON.stringify(hub)).not.toContain("user_id");
      expect(JSON.stringify(hub)).not.toContain("event_email_enabled");
      expect(JSON.stringify(hub)).not.toContain("connections");
      expect(
        (
          await sql<{ r: any }>(
            "select public.sontu_public_profile_hub($1) r",
            ["not a handle"],
          )
        )[0].r.status,
      ).toBe("not_found");
    } finally {
      await db.exec("reset role");
      await asHost();
    }
  });

  it("lets a signed-in profile visitor request a connection for owner review", async () => {
    const owner = randomUUID(),
      requester = randomUUID();
    await sql("insert into auth.users(id,email) values($1,$2),($3,$4)", [
      owner,
      "hub-owner@example.com",
      requester,
      "hub-requester@example.com",
    ]);
    await asHost(owner);
    const ownerProfile = (
      await sql<{ r: any }>("select public.sontu_account_profile($1,$2) r", [
        "create",
        JSON.stringify({ first_name: "Owner" }),
      ])
    )[0].r.profile;
    await asHost(requester);
    await sql<{ r: any }>("select public.sontu_account_profile($1,$2) r", [
      "create",
      JSON.stringify({ first_name: "Requester" }),
    ]);
    const request = (
      await sql<{ r: any }>("select public.sontu_connections($1,$2) r", [
        "request",
        JSON.stringify({ handle: ownerProfile.handle }),
      ])
    )[0].r;
    expect(request).toMatchObject({
      status: "ready",
      connection_status: "PENDING",
    });
    expect(
      (
        await sql<{ r: any }>("select public.sontu_connections($1,$2) r", [
          "accept",
          JSON.stringify({ connection_id: request.connection_id }),
        ])
      )[0].r.error_code,
    ).toBe("REQUEST_NOT_FOUND");
    const requesterHubAfterRequest = (
      await sql<{ r: any }>("select public.sontu_public_profile_hub($1) r", [
        ownerProfile.handle,
      ])
    )[0].r;
    expect(requesterHubAfterRequest.viewer.connection_status).toBe(
      "pending_sent",
    );
    const requesterRead = (
      await sql<{ r: any }>("select public.sontu_connections($1,$2) r", [
        "read",
        "{}",
      ])
    )[0].r;
    expect(requesterRead.requests).toEqual([]);
    await asHost(owner);
    const ownerRead = (
      await sql<{ r: any }>("select public.sontu_connections($1,$2) r", [
        "read",
        "{}",
      ])
    )[0].r;
    expect(ownerRead.requests).toHaveLength(1);
    expect(ownerRead.requests[0]).toMatchObject({
      display_name: "Requester",
      handle: expect.any(String),
    });
    expect(JSON.stringify(ownerRead.requests[0])).not.toContain("email");
    const ownerViewOfRequester = (
      await sql<{ r: any }>("select public.sontu_public_profile_hub($1) r", [
        ownerRead.requests[0].handle,
      ])
    )[0].r;
    expect(ownerViewOfRequester.viewer.connection_status).toBe(
      "pending_received",
    );
    expect(
      (
        await sql<{ r: any }>("select public.sontu_connections($1,$2) r", [
          "deny",
          JSON.stringify({ connection_id: request.connection_id }),
        ])
      )[0].r.status,
    ).toBe("ready");
    const ownerReadAfterDeny = (
      await sql<{ r: any }>("select public.sontu_connections($1,$2) r", [
        "read",
        "{}",
      ])
    )[0].r;
    expect(ownerReadAfterDeny.requests).toEqual([]);
    await asHost(requester);
    const rerequest = (
      await sql<{ r: any }>("select public.sontu_connections($1,$2) r", [
        "request",
        JSON.stringify({ handle: ownerProfile.handle }),
      ])
    )[0].r;
    expect(rerequest).toMatchObject({
      status: "ready",
      connection_status: "PENDING",
    });
    await asHost(owner);
    expect(
      (
        await sql<{ r: any }>("select public.sontu_connections($1,$2) r", [
          "accept",
          JSON.stringify({ connection_id: rerequest.connection_id }),
        ])
      )[0].r.status,
    ).toBe("ready");
    const accepted = (
      await sql<{ r: any }>("select public.sontu_connections($1,$2) r", [
        "read",
        "{}",
      ])
    )[0].r;
    expect(accepted.requests).toEqual([]);
    expect(accepted.connections[0].status).toBe("ACCEPTED");
    const ownerHubAfterAccept = (
      await sql<{ r: any }>("select public.sontu_public_profile_hub($1) r", [
        ownerRead.requests[0].handle,
      ])
    )[0].r;
    expect(ownerHubAfterAccept.viewer.connection_status).toBe("connected");
    expect(JSON.stringify(ownerHubAfterAccept)).not.toContain("email");
  });

  it("keeps follows independent from trusted connection visibility", async () => {
    const owner = randomUUID(),
      follower = randomUUID();
    await sql("insert into auth.users(id,email) values($1,$2),($3,$4)", [
      owner,
      "follow-owner@example.com",
      follower,
      "follow-visitor@example.com",
    ]);

    await asHost(owner);
    const ownerProfile = (
      await sql<{ r: any }>("select public.sontu_account_profile($1,$2) r", [
        "create",
        JSON.stringify({ first_name: "Followed" }),
      ])
    )[0].r.profile;
    const ownerUpdate = (
      await sql<{ r: any }>("select public.sontu_account_profile($1,$2) r", [
        "update",
        JSON.stringify({
          first_name: "Followed",
          handle: ownerProfile.handle,
          revision: ownerProfile.revision,
          bio: "Only trusted people should see this.",
          bio_visibility: "CLOSE",
        }),
      ])
    )[0].r;
    expect(ownerUpdate.status).toBe("ready");

    await asHost(follower);
    const followerProfile = (
      await sql<{ r: any }>("select public.sontu_account_profile($1,$2) r", [
        "create",
        JSON.stringify({ first_name: "Follower" }),
      ])
    )[0].r.profile;
    const follow = (
      await sql<{ r: any }>("select public.sontu_connections($1,$2) r", [
        "follow",
        JSON.stringify({ handle: ownerProfile.handle }),
      ])
    )[0].r;
    expect(follow).toMatchObject({ status: "ready", following: true });

    const followerHub = (
      await sql<{ r: any }>("select public.sontu_public_profile_hub($1) r", [
        ownerProfile.handle,
      ])
    )[0].r;
    expect(followerHub.viewer).toMatchObject({
      following: true,
      connection_status: "none",
      close: false,
    });
    expect(followerHub.profile.fields.bio).toBeUndefined();
    expect(followerHub.profile.counts.followers).toBe(1);
    expect(JSON.stringify(followerHub)).not.toContain("email");

    const followerRead = (
      await sql<{ r: any }>("select public.sontu_connections($1,$2) r", [
        "read",
        "{}",
      ])
    )[0].r;
    expect(followerRead.following).toMatchObject([
      { display_name: "Followed", handle: ownerProfile.handle },
    ]);
    expect(followerRead.connections).toEqual([]);
    expect(JSON.stringify(followerRead.following)).not.toContain("email");

    await asHost(owner);
    const ownerRead = (
      await sql<{ r: any }>("select public.sontu_connections($1,$2) r", [
        "read",
        "{}",
      ])
    )[0].r;
    expect(ownerRead.followers).toMatchObject([
      { display_name: "Follower", handle: followerProfile.handle },
    ]);
    expect(JSON.stringify(ownerRead.followers)).not.toContain("email");

    expect(
      (
        await sql<{ r: any }>("select public.sontu_connections($1,$2) r", [
          "follow",
          JSON.stringify({ handle: ownerProfile.handle }),
        ])
      )[0].r.error_code,
    ).toBe("SELF_FOLLOW");

    await asHost(follower);
    const unfollow = (
      await sql<{ r: any }>("select public.sontu_connections($1,$2) r", [
        "unfollow",
        JSON.stringify({ handle: ownerProfile.handle }),
      ])
    )[0].r;
    expect(unfollow).toMatchObject({ status: "ready", following: false });
  });

  it("shows only public hosted events on profile activity", async () => {
    const owner = randomUUID(),
      otherHost = randomUUID(),
      publicEvent = randomUUID(),
      privateEvent = randomUUID(),
      unlistedEvent = randomUUID(),
      attendeeOnlyEvent = randomUUID();
    await sql(
      "insert into auth.users(id,email) values($1,$2),($3,$4)",
      [
        owner,
        "activity-owner@example.com",
        otherHost,
        "activity-other-host@example.com",
      ],
    );
    await asHost(owner);
    const ownerProfile = (
      await sql<{ r: any }>("select public.sontu_account_profile($1,$2) r", [
        "create",
        JSON.stringify({ first_name: "Activity" }),
      ])
    )[0].r.profile;

    await sql(
      `insert into sontu_private.event_instances(id,host_owner_user_id,lifecycle,event_kind,visibility,event_category,event_format)
       values
        ($1,$2,'PUBLISHED','SIMPLE','PUBLIC','Music','in-person'),
        ($3,$2,'PUBLISHED','SIMPLE','PRIVATE','Private','in-person'),
        ($4,$2,'PUBLISHED','SIMPLE','UNLISTED','Unlisted','in-person'),
        ($5,$6,'PUBLISHED','SIMPLE','PUBLIC','Community','in-person')`,
      [publicEvent, owner, privateEvent, unlistedEvent, attendeeOnlyEvent, otherHost],
    );
    await sql(
      `insert into sontu_private.event_versions(event_instance_id,version_number,title,description,starts_at,ends_at,timezone,venue_label,cover_key,materiality_class,created_by)
       values
        ($1,1,'Public hosted event','Visible on profile','2031-07-01T20:00:00Z','2031-07-01T22:00:00Z','America/Toronto','Public venue','music','INITIAL',$5),
        ($2,1,'Private hosted event','Hidden from profile','2031-07-02T20:00:00Z','2031-07-02T22:00:00Z','America/Toronto','Private venue','food','INITIAL',$5),
        ($3,1,'Unlisted hosted event','Hidden from profile','2031-07-03T20:00:00Z','2031-07-03T22:00:00Z','America/Toronto','Unlisted venue','market','INITIAL',$5),
        ($4,1,'Attendee-only event','Hidden from profile','2031-07-04T20:00:00Z','2031-07-04T22:00:00Z','America/Toronto','Other venue','sunset','INITIAL',$6)`,
      [publicEvent, privateEvent, unlistedEvent, attendeeOnlyEvent, owner, otherHost],
    );
    await sql(
      "insert into sontu_private.event_participants(event_instance_id,participant_user_id,display_name,commitment_state) values($1,$2,'Activity','CONFIRMED')",
      [attendeeOnlyEvent, owner],
    );

    await asHost("");
    const hub = (
      await sql<{ r: any }>("select public.sontu_public_profile_hub($1) r", [
        ownerProfile.handle,
      ])
    )[0].r;
    expect(hub.profile.activity).toHaveLength(1);
    expect(hub.profile.activity[0]).toMatchObject({
      id: publicEvent,
      relationship: "host",
      title: "Public hosted event",
      venue_label: "Public venue",
    });
    expect(JSON.stringify(hub.profile.activity)).not.toContain("Private hosted event");
    expect(JSON.stringify(hub.profile.activity)).not.toContain("Unlisted hosted event");
    expect(JSON.stringify(hub.profile.activity)).not.toContain("Attendee-only event");
    expect(JSON.stringify(hub)).not.toContain("activity-owner@example.com");
  });

  it("applies General, Close, and Only-me profile field visibility without group inference", async () => {
    const owner = randomUUID(),
      closeViewer = randomUUID(),
      groupedViewer = randomUUID();
    await sql(
      "insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6)",
      [
        owner,
        "visibility-owner@example.com",
        closeViewer,
        "close-viewer@example.com",
        groupedViewer,
        "grouped-viewer@example.com",
      ],
    );
    await asHost(owner);
    const ownerProfile = (
      await sql<{ r: any }>("select public.sontu_account_profile($1,$2) r", [
        "create",
        JSON.stringify({ first_name: "Visible" }),
      ])
    )[0].r.profile;
    const ownerUpdate = (
      await sql<{ r: any }>("select public.sontu_account_profile($1,$2) r", [
        "update",
        JSON.stringify({
          first_name: "Visible",
          handle: ownerProfile.handle,
          revision: ownerProfile.revision,
          avatar_path: `${owner}/avatar.png`,
          bio: "Close-circle bio",
          bio_visibility: "CLOSE",
          contact_email: "hello@example.com",
          contact_email_visibility: "GENERAL",
          phone_number: "+1 416 555 0199",
          phone_visibility: "CLOSE",
          profile_location: "Toronto, Ontario",
          location_visibility: "ONLY_ME",
          link_label: "Public link",
          link_url: "https://example.com",
          link_visibility: "GENERAL",
          interests: ["Music", "Food & Drink", "Outdoors"],
          interests_visibility: "CLOSE",
        }),
      ])
    )[0].r;
    expect(ownerUpdate.status).toBe("ready");
    expect(ownerUpdate.profile.avatar_path).toBe(`${owner}/avatar.png`);

    const createProfile = async (id: string, firstName: string) => {
      await asHost(id);
      await sql<{ r: any }>("select public.sontu_account_profile($1,$2) r", [
        "create",
        JSON.stringify({ first_name: firstName }),
      ]);
      const request = (
        await sql<{ r: any }>("select public.sontu_connections($1,$2) r", [
          "request",
          JSON.stringify({ handle: ownerProfile.handle }),
        ])
      )[0].r;
      await asHost(owner);
      expect(
        (
          await sql<{ r: any }>("select public.sontu_connections($1,$2) r", [
            "accept",
            JSON.stringify({ connection_id: request.connection_id }),
          ])
        )[0].r.status,
      ).toBe("ready");
      return request.connection_id;
    };

    const closeConnectionId = await createProfile(closeViewer, "Close");
    const groupedConnectionId = await createProfile(groupedViewer, "Grouped");
    expect(groupedConnectionId).toEqual(expect.any(String));

    await sql<{ r: any }>("select public.sontu_connections($1,$2) r", [
      "set_close",
      JSON.stringify({ connection_id: closeConnectionId, is_close: true }),
    ]);
    const context = (
      await sql<{ r: any }>("select public.sontu_connections($1,$2) r", [
        "create_context",
        JSON.stringify({ name: "Family" }),
      ])
    )[0].r;
    await sql<{ r: any }>("select public.sontu_connections($1,$2) r", [
      "add_member",
      JSON.stringify({
        context_id: context.context_id,
        user_id: groupedViewer,
      }),
    ]);

    await asHost("");
    const publicHub = (
      await sql<{ r: any }>("select public.sontu_public_profile_hub($1) r", [
        ownerProfile.handle,
      ])
    )[0].r;
    expect(publicHub.profile.fields).toEqual({
      email: "hello@example.com",
      link: { label: "Public link", url: "https://example.com" },
    });
    expect(publicHub.profile.fields.interests).toBeUndefined();
    expect(publicHub.profile.avatar_path).toBe(`${owner}/avatar.png`);

    await asHost(closeViewer);
    const closeHub = (
      await sql<{ r: any }>("select public.sontu_public_profile_hub($1) r", [
        ownerProfile.handle,
      ])
    )[0].r;
    expect(closeHub.viewer.close).toBe(true);
    expect(closeHub.profile.fields.bio).toBe("Close-circle bio");
    expect(closeHub.profile.fields.email).toBe("hello@example.com");
    expect(closeHub.profile.fields.phone).toBe("+1 416 555 0199");
    expect(closeHub.profile.fields.location).toBeUndefined();
    expect(closeHub.profile.fields.interests).toEqual(
      expect.arrayContaining(["Food & Drink", "Music", "Outdoors"]),
    );
    expect(closeHub.profile.fields.interests).toHaveLength(3);

    await asHost(groupedViewer);
    const groupedHub = (
      await sql<{ r: any }>("select public.sontu_public_profile_hub($1) r", [
        ownerProfile.handle,
      ])
    )[0].r;
    expect(groupedHub.viewer.close).toBe(false);
    expect(groupedHub.profile.fields.email).toBe("hello@example.com");
    expect(groupedHub.profile.fields.phone).toBeUndefined();
    expect(groupedHub.profile.fields.location).toBeUndefined();
    expect(groupedHub.profile.fields.bio).toBeUndefined();
    expect(groupedHub.profile.fields.interests).toBeUndefined();

    await asHost(owner);
    const ownerOnly = (
      await sql<{ r: any }>("select public.sontu_account_profile($1,$2) r", [
        "update",
        JSON.stringify({
          first_name: "Visible",
          handle: ownerProfile.handle,
          revision: ownerUpdate.profile.revision,
          bio: "Only owner bio",
          bio_visibility: "ONLY_ME",
        }),
      ])
    )[0].r;
    expect(ownerOnly.status).toBe("ready");
    const ownerHub = (
      await sql<{ r: any }>("select public.sontu_public_profile_hub($1) r", [
        ownerProfile.handle,
      ])
    )[0].r;
    expect(ownerHub.profile.fields.location).toBe("Toronto, Ontario");
    await asHost(closeViewer);
    const closeAfterOnlyMe = (
      await sql<{ r: any }>("select public.sontu_public_profile_hub($1) r", [
        ownerProfile.handle,
      ])
    )[0].r;
    expect(closeAfterOnlyMe.profile.fields.bio).toBeUndefined();

    await asHost(owner);
    expect(
      (
        await sql<{ r: any }>(
          "select public.sontu_connection_context_maintenance('rename',$1) r",
          [JSON.stringify({ context_id: context.context_id, name: "Trusted circle" })],
        )
      )[0].r.status,
    ).toBe("ready");
    expect(
      (
        await sql<{ r: any }>("select public.sontu_connections('read','{}') r")
      )[0].r.contexts[0].name,
    ).toBe("Trusted circle");
    await asHost(closeViewer);
    expect(
      (
        await sql<{ r: any }>(
          "select public.sontu_connection_context_maintenance('delete',$1) r",
          [JSON.stringify({ context_id: context.context_id })],
        )
      )[0].r.error_code,
    ).toBe("CONTEXT_NOT_FOUND");
    await asHost(owner);
    expect(
      (
        await sql<{ r: any }>(
          "select public.sontu_connection_context_maintenance('delete',$1) r",
          [JSON.stringify({ context_id: context.context_id })],
        )
      )[0].r.status,
    ).toBe("ready");
    expect(
      (
        await sql<{ r: any }>("select public.sontu_connections('read','{}') r")
      )[0].r.contexts,
    ).toEqual([]);
  });
});

describe("account privacy-request intake", () => {
  it("records only the signed-in person's valid requests and deduplicates open work", async () => {
    const call = async (action: string, requestedKind: string | null = null) =>
      (
        await sql<{ r: any }>("select public.sontu_privacy_request($1,$2) r", [
          action,
          requestedKind,
        ])
      )[0].r;
    await asHost(host);
    expect((await call("read")).requests).toEqual([]);
    expect((await call("request")).error_code).toBe("INVALID_ACTION");
    const exportRequest = await call("request", "ACCESS_EXPORT");
    expect(exportRequest.status).toBe("ready");
    expect(exportRequest.request.status).toBe("RECEIVED");
    expect((await call("request", "ACCESS_EXPORT")).already_open).toBe(true);
    expect((await call("request", "DELETE_OR_CLOSE")).already_open).toBe(false);
    expect((await call("read")).requests).toHaveLength(2);
    await asHost(stranger);
    expect((await call("read")).requests).toEqual([]);
  });
});

describe("private support-report intake", () => {
  it("accepts bounded reports and isolates them to the reporter", async () => {
    const call = async (action: string, input: object = {}) => (await sql<{ r: any }>("select public.sontu_support_report($1,$2) r", [action, JSON.stringify(input)]))[0].r;
    await asHost(host);
    expect((await call("create", { report_kind: "PRODUCT_DEFECT", body: "The event hub did not reload." })).status).toBe("ready");
    expect((await call("create", { report_kind: "NOPE", body: "x" })).error_code).toBe("INVALID_INPUT");
    expect((await call("read")).reports).toHaveLength(1);
    await asHost(stranger);
    expect((await call("read")).reports).toEqual([]);
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
      "insert into sontu_private.event_participants(event_instance_id,participant_user_id,display_name,commitment_state) values($1,$2,'Committed test guest','CONFIRMED')",
      [event, stranger],
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
    expect(p.communications).toEqual([{ dispatch_state: "PENDING", count: 1 }]);
    await asHost(stranger);
    expect(
      (
        await sql<{ r: any }>(
          "select public.sontu_participant_communication_history($1,null) r",
          [event],
        )
      )[0].r,
    ).toMatchObject({
      status: "ready",
      notices: [{ kind: "EVENT_CHANGE", state: "PENDING" }],
    });
    await asHost();
    expect(
      (
        await sql<{ r: any }>(
          "select public.sontu_participant_communication_history($1,$2) r",
          [event, randomUUID()],
        )
      )[0].r.error_code,
    ).toBe("INVITATION_UNAVAILABLE");
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
    await sql("update auth.users set email='owner@sontu.test' where id=$1", [
      host,
    ]);
    await sql(
      "update auth.users set email='teammate@sontu.test',email_confirmed_at=now() where id=$1",
      [stranger],
    );
    const added = (
      await sql<{ r: any }>(
        "select public.sontu_team_command('add_member',$1,null,$2,$3) r",
        [
          event,
          randomUUID(),
          JSON.stringify({
            email: "teammate@sontu.test",
            role: "VOLUNTEER",
            attends_event: true,
            public_visibility: "EVENT_TEAM",
          }),
        ],
      )
    )[0].r;
    expect(added.status).toBe("ready");
    let team = (
      await sql<{ r: any }>("select public.sontu_team_projection($1) r", [
        event,
      ])
    )[0].r;
    expect(team.members[0]).toMatchObject({
      role: "VOLUNTEER",
      attends_event: true,
      public_visibility: "EVENT_TEAM",
    });
    await sql("select public.sontu_team_command('update_member',$1,$2,$3,$4)", [
      event,
      added.item_id,
      randomUUID(),
      JSON.stringify({ attends_event: false, public_visibility: "HIDDEN" }),
    ]);
    team = (
      await sql<{ r: any }>("select public.sontu_team_projection($1) r", [
        event,
      ])
    )[0].r;
    expect(team.members[0]).toMatchObject({
      role: "VOLUNTEER",
      attends_event: false,
      public_visibility: "HIDDEN",
    });
    const todo = (
      await sql<{ r: any }>(
        "select public.sontu_event_operations_command('add_todo',$1,null,$2,$3) r",
        [event, randomUUID(), JSON.stringify({ title: "Set signs" })],
      )
    )[0].r;
    expect(
      (
        await sql<{ r: any }>(
          "select public.sontu_assign_operation_item('todo',$1,$2,$3,$4) r",
          [event, todo.item_id, added.item_id, randomUUID()],
        )
      )[0].r.status,
    ).toBe("ready");
    expect(
      (
        await sql<{ r: any }>(
          "select public.sontu_event_operations_projection($1) r",
          [event],
        )
      )[0].r.todos.find((x: any) => x.id === todo.item_id)
        .assignee_team_member_id,
    ).toBe(added.item_id);
    await asHost(stranger);
    expect(
      (
        await sql<{ r: any }>("select public.sontu_team_projection($1) r", [
          event,
        ])
      )[0].r.error_code,
    ).toBe("UNAUTHORIZED");
    expect(
      (
        await sql<{ r: any }>(
          "select public.sontu_event_operations_projection($1) r",
          [event],
        )
      )[0].r.status,
    ).toBe("ready");
    expect(
      (
        await sql<{ r: any }>(
          "select public.sontu_event_operations_command('add_todo',$1,null,$2,$3) r",
          [event, randomUUID(), JSON.stringify({ title: "No volunteer edits" })],
        )
      )[0].r.error_code,
    ).toBe("UNAUTHORIZED");
    expect(
      (
        await sql<{ r: any }>(
          "select public.sontu_event_host_questions('answer',$1,$2,$3) r",
          [event, randomUUID(), "No volunteer replies"],
        )
      )[0].r.error_code,
    ).toBe("UNAUTHORIZED");
    await asHost();
  });
});

describe("auditable event check-in", () => {
  it("admits once, reports duplicates, rejects wrong-event use and permits check-in staff", async () => {
    await asHost();
    const created = await command("create_draft", {
      timezone: "America/Toronto",
    });
    event = created.event_id;
    version = created.current_version;
    await command("save_draft", {
      title: "Check-in test",
      description: "Admission test",
      starts_at: "2030-10-01T22:00:00Z",
      ends_at: "2030-10-02T00:00:00Z",
      timezone: "America/Toronto",
      venue_label: "Door A",
      cover_key: "sunset",
      capacity: "20",
    });
    await command("publish", { confirmed: true });
    const guest = randomUUID();
    await sql(
      "insert into sontu_private.event_participants(id,event_instance_id,display_name,commitment_state) values($1,$2,'Taylor Guest','CONFIRMED')",
      [guest, event],
    );
    await sql("update auth.users set email='teammate@sontu.test' where id=$1", [
      stranger,
    ]);
    await sql("select public.sontu_team_command('add_member',$1,null,$2,$3)", [
      event,
      randomUUID(),
      JSON.stringify({
        email: "teammate@sontu.test",
        role: "CHECK_IN_STAFF",
        attends_event: false,
        public_visibility: "HIDDEN",
      }),
    ]);
    await asHost(stranger);
    expect(
      (
        await sql<{ r: any }>("select public.sontu_check_in_projection($1) r", [
          event,
        ])
      )[0].r.counts,
    ).toEqual({ eligible: 1, admitted: 0 });
    expect(
      (
        await sql<{ r: any }>(
          "select public.sontu_check_in_command($1,$2,$3) r",
          [event, guest, randomUUID()],
        )
      )[0].r.error_code,
    ).toBe("NOT_ELIGIBLE");
    await asHost();
    const startOp = randomUUID();
    const started = (
      await sql<{ r: any }>("select public.sontu_start_event($1,$2) r", [
        event,
        startOp,
      ])
    )[0].r;
    expect(started).toMatchObject({
      status: "ready",
      lifecycle: "IN_PROGRESS",
    });
    expect(
      (
        await sql<{ r: any }>("select public.sontu_start_event($1,$2) r", [
          event,
          startOp,
        ])
      )[0].r,
    ).toEqual(started);
    await asHost(stranger);
    const first = (
      await sql<{ r: any }>(
        "select public.sontu_check_in_command($1,$2,$3) r",
        [event, guest, randomUUID()],
      )
    )[0].r;
    expect(first.result).toBe("ADMITTED");
    const duplicate = (
      await sql<{ r: any }>(
        "select public.sontu_check_in_command($1,$2,$3) r",
        [event, guest, randomUUID()],
      )
    )[0].r;
    expect(duplicate.result).toBe("ALREADY_USED");
    expect(
      (
        await sql<{ r: any }>(
          "select public.sontu_check_in_command($1,$2,$3) r",
          [event, randomUUID(), randomUUID()],
        )
      )[0].r.result,
    ).toBe("INVALID");
    expect(
      (
        await sql<{ count: number }>(
          "select count(*)::int count from sontu_private.audit_entries where event_instance_id=$1 and audit_kind='CHECK_IN_ATTEMPT'",
          [event],
        )
      )[0].count,
    ).toBe(4);
    await asHost();
  });
  it("blocks premature closeout and preserves an honest attendance snapshot", async () => {
    await asHost();
    const todo = (
      await sql<{ r: any }>(
        "select public.sontu_event_operations_command('add_todo',$1,null,$2,$3) r",
        [event, randomUUID(), JSON.stringify({ title: "Final sweep" })],
      )
    )[0].r;
    expect(
      (
        await sql<{ r: any }>("select public.sontu_close_event($1,$2,true) r", [
          event,
          randomUUID(),
        ])
      )[0].r.error_code,
    ).toBe("OPEN_TODOS");
    await sql(
      "select public.sontu_event_operations_command('set_todo_state',$1,$2,$3,$4)",
      [event, todo.item_id, randomUUID(), JSON.stringify({ state: "DONE" })],
    );
    const op = randomUUID();
    const closed = (
      await sql<{ r: any }>("select public.sontu_close_event($1,$2,true) r", [
        event,
        op,
      ])
    )[0].r;
    expect(closed).toMatchObject({ status: "ready", lifecycle: "COMPLETED" });
    expect(
      (
        await sql<{ r: any }>("select public.sontu_close_event($1,$2,true) r", [
          event,
          op,
        ])
      )[0].r,
    ).toEqual(closed);
    const results = (
      await sql<{ r: any }>("select public.sontu_results_projection($1) r", [
        event,
      ])
    )[0].r;
    expect(results.lifecycle).toBe("COMPLETED");
    expect(results.closeout).toMatchObject({
      confirmed: 1,
      admitted: 1,
      attendance_unknown: 0,
    });
    expect((await projection()).event.lifecycle).toBe("COMPLETED");
  });
});

describe("private ask-host inbox", () => {
  it("allows confirmed account participants to ask and hosts to answer without exposing questions to others", async () => {
    await asHost();
    const created = await command("create_draft", {
      timezone: "America/Toronto",
    });
    event = created.event_id;
    version = created.current_version;
    await command("save_draft", {
      title: "Ask host test",
      description: "Private questions",
      starts_at: "2031-01-01T18:00:00Z",
      ends_at: "2031-01-01T20:00:00Z",
      timezone: "America/Toronto",
      venue_label: "Sontu Hall",
      cover_key: "sunset",
    });
    await command("publish", { confirmed: true });
    await sql(
      "insert into sontu_private.event_participants(event_instance_id,participant_user_id,display_name,commitment_state) values($1,$2,'Member','CONFIRMED')",
      [event, stranger],
    );
    await asHost(stranger);
    const asked = (
      await sql<{ r: any }>(
        "select public.sontu_event_host_questions('ask',$1,null,$2) r",
        [event, "Is parking available?"],
      )
    )[0].r;
    expect(asked.status).toBe("ready");
    const ownQuestions = (
      await sql<{ r: any }>(
        "select public.sontu_event_host_questions('read',$1,null,null) r",
        [event],
      )
    )[0].r;
    expect(ownQuestions.items).toHaveLength(1);
    await asHost();
    const hostQuestions = (
      await sql<{ r: any }>(
        "select public.sontu_event_host_questions('read',$1,null,null) r",
        [event],
      )
    )[0].r;
    expect(hostQuestions.items[0].question).toBe("Is parking available?");
    expect(
      (
        await sql<{ r: any }>(
          "select public.sontu_event_host_questions('answer',$1,$2,$3) r",
          [event, asked.id, "Yes, use the south lot."],
        )
      )[0].r.status,
    ).toBe("ready");
    await asHost(stranger);
    expect(
      (
        await sql<{ r: any }>(
          "select public.sontu_event_host_questions('close',$1,$2,null) r",
          [event, asked.id],
        )
      )[0].r.error_code,
    ).toBe("UNAUTHORIZED");
  });
});

describe("configurable RSVP form", () => {
  it("lets hosts configure limited questions and participants save structured answers", async () => {
    await asHost();
    const created = await command("create_draft", {
      timezone: "America/Toronto",
    });
    event = created.event_id;
    version = created.current_version;
    await command("save_draft", {
      title: "RSVP questions test",
      description: "Structured RSVP",
      starts_at: "2032-02-01T20:00:00Z",
      ends_at: "2032-02-01T22:00:00Z",
      timezone: "America/Toronto",
      venue_label: "Room Q",
      cover_key: "market",
      capacity: "12",
    });
    await command("publish", { confirmed: true });
    const configured = (
      await sql<{ r: any }>(
        "select public.sontu_rsvp_form('CONFIGURE',$1,null,$2,null) r",
        [
          event,
          JSON.stringify({
            questions: [
              {
                prompt: "Meal",
                type: "SINGLE_SELECT",
                required: true,
                per_attendee: true,
                options: ["Vegetarian", "Chicken"],
              },
            ],
          }),
        ],
      )
    )[0].r;
    expect(configured.status).toBe("ready");
    const question = configured.questions[0];
    const token = randomBytes(32).toString("hex");
    const participant = randomUUID();
    await sql(
      `insert into sontu_private.event_participants(
        id,event_instance_id,display_name,commitment_state,plus_one_allowance,token_hash,token_expires_at
      ) values($1,$2,'Taylor RSVP','CONFIRMED',1,sha256(convert_to($3::text,'UTF8')),now()+interval '1 day')`,
      [participant, event, token],
    );
    await asHost("");
    const payload = {
      attendees: [
        { name: "Taylor RSVP", answers: { [question.id]: "Vegetarian" } },
        { name: "Guest One", answers: { [question.id]: "Chicken" } },
      ],
    };
    const op = randomUUID();
    const saved = (
      await sql<{ r: any }>(
        "select public.sontu_rsvp_form('SAVE',$1,$2,$3,$4) r",
        [event, token, JSON.stringify(payload), op],
      )
    )[0].r;
    expect(saved.status).toBe("ready");
    expect(
      (
        await sql<{ r: any }>(
          "select public.sontu_rsvp_form('SAVE',$1,$2,$3,$4) r",
          [event, token, JSON.stringify(payload), op],
        )
      )[0].r,
    ).toEqual(saved);
    await asHost();
    const summary = (
      await sql<{ r: any }>(
        "select public.sontu_rsvp_response_summary($1) r",
        [event],
      )
    )[0].r;
    expect(summary.responses).toEqual(
      expect.arrayContaining([
        {
          participant_id: participant,
          invitee_name: "Taylor RSVP",
          attendee_name: "Taylor RSVP",
          question: "Meal",
          answer: "Vegetarian",
          updated_at: expect.any(String),
        },
        {
          participant_id: participant,
          invitee_name: "Taylor RSVP",
          attendee_name: "Guest One",
          question: "Meal",
          answer: "Chicken",
          updated_at: expect.any(String),
        },
      ]),
    );
    expect(summary.responses).toHaveLength(2);
  });
});

describe("event-scoped discussion", () => {
  it("keeps discussion participant-only and lets the host hide a post", async () => {
    await asHost();
    const created = await command("create_draft", {
      timezone: "America/Toronto",
    });
    event = created.event_id;
    version = created.current_version;
    await command("save_draft", {
      title: "Discussion test",
      description: "Bounded board",
      starts_at: "2033-06-01T22:00:00Z",
      ends_at: "2033-06-02T00:00:00Z",
      timezone: "America/Toronto",
      venue_label: "Room A",
      cover_key: "market",
      capacity: "12",
    });
    await command("publish", { confirmed: true });
    await sql(
      "insert into sontu_private.event_participants(event_instance_id,participant_user_id,display_name,commitment_state) values($1,$2,'Member','CONFIRMED')",
      [event, stranger],
    );
    expect(
      (
        await sql<{ r: any }>(
          "select public.sontu_event_discussion('configure',$1,null,null,true) r",
          [event],
        )
      )[0].r.enabled,
    ).toBe(true);
    await asHost(stranger);
    const post = (
      await sql<{ r: any }>(
        "select public.sontu_event_discussion('post',$1,null,'Looking forward to it',null) r",
        [event],
      )
    )[0].r;
    expect(post.status).toBe("ready");
    await asHost();
    expect(
      (
        await sql<{ r: any }>(
          "select public.sontu_event_discussion('hide',$1,$2,null,null) r",
          [event, post.id],
        )
      )[0].r.status,
    ).toBe("ready");
    await asHost(stranger);
    expect(
      (
        await sql<{ r: any }>(
          "select public.sontu_event_discussion('read',$1,null,null,null) r",
          [event],
        )
      )[0].r.items,
    ).toEqual([]);
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
      await db.exec("reset role");
      await asHost("");
      await db.exec("set role anon");
      const anonymous = randomUUID();
      await sql(
        "insert into public.sontu_dev_notes(id,session_id,body,screen) values($1,$2,'Signed out captured','home')",
        [randomUUID(), anonymous],
      );
      await expect(
        sql("select body from public.sontu_dev_notes where session_id=$1", [
          anonymous,
        ]),
      ).rejects.toThrow();
    } finally {
      await db.exec("reset role");
      await asHost();
    }
  });
});

describe("temporary beta telemetry", () => {
  it("allows safe milestone inserts without client-side read access", async () => {
    await asHost("");
    await db.exec("set role anon");
    try {
      const session = randomUUID();
      const id = randomUUID();
      await sql(
        "insert into public.sontu_beta_telemetry(id,session_id,event_name,screen,metadata) values($1,$2,'route_view','home',$3)",
        [id, session, JSON.stringify({ route: "home" })],
      );
      await sql(
        "insert into public.sontu_beta_telemetry(id,session_id,event_name,screen,metadata) values($1,$2,'event_interest_saved','invitation','{}')",
        [randomUUID(), session],
      );
      for (const eventName of [
        "create_draft_attempted",
        "create_draft_delayed",
        "create_draft_succeeded",
        "create_draft_failed",
      ]) {
        await sql(
          "insert into public.sontu_beta_telemetry(id,session_id,event_name,screen,metadata) values($1,$2,$3,'hosting',$4)",
          [
            randomUUID(),
            session,
            eventName,
            JSON.stringify({
              retrying: eventName !== "create_draft_attempted",
              owner_kind: "PERSONAL",
            }),
          ],
        );
      }
      for (const eventName of [
        "host_link_issue_attempted",
        "host_link_issue_succeeded",
        "host_link_issue_failed",
        "host_link_revoke_attempted",
        "host_link_revoke_succeeded",
        "host_link_revoke_failed",
        "host_rsvp_remove_attempted",
        "host_rsvp_remove_succeeded",
        "host_rsvp_remove_failed",
      ]) {
        await sql(
          "insert into public.sontu_beta_telemetry(id,session_id,event_name,screen,metadata) values($1,$2,$3,'hosting',$4)",
          [
            randomUUID(),
            session,
            eventName,
            JSON.stringify({
              participant_kind: "guest",
              error_code: eventName.endsWith("_failed") ? "INVALID_STATE" : null,
            }),
          ],
        );
      }
      await expect(
        sql("select event_name from public.sontu_beta_telemetry where id=$1", [
          id,
        ]),
      ).rejects.toThrow();
    } finally {
      await db.exec("reset role");
      await asHost();
    }
  });

  it("rejects impersonation and sensitive telemetry metadata", async () => {
    await asHost();
    await db.exec("set role authenticated");
    try {
      await sql(
        "insert into public.sontu_beta_telemetry(id,session_id,event_name,screen,metadata) values($1,$2,'rsvp_form_save_failed','hosting',$3)",
        [randomUUID(), randomUUID(), JSON.stringify({ error_code: "INVALID_INPUT" })],
      );
      await expect(
        sql(
          "insert into public.sontu_beta_telemetry(id,session_id,user_id,event_name,screen,metadata) values($1,$2,$3,'route_view','home','{}')",
          [randomUUID(), randomUUID(), stranger],
        ),
      ).rejects.toThrow();
      await expect(
        sql(
          "insert into public.sontu_beta_telemetry(id,session_id,event_name,screen,metadata) values($1,$2,'accommodation_request_failed','invitation',$3)",
          [randomUUID(), randomUUID(), JSON.stringify({ request: "email me at tester@example.com" })],
        ),
      ).rejects.toThrow();
    } finally {
      await db.exec("reset role");
      await asHost();
    }
  });
});

describe("commerce-ready admission authority", () => {
  it("keeps orders private and derives admission validity from payment state", async () => {
    await asHost();
    const created = await command("create_draft", {
      timezone: "America/Toronto",
    });
    event = created.event_id;
    version = created.current_version;
    await command("save_draft", {
      title: "Admission authority test",
      description: "Private order-state plumbing only.",
      starts_at: "2034-06-01T22:00:00Z",
      ends_at: "2034-06-02T00:00:00Z",
      timezone: "America/Toronto",
      venue_label: "Room A",
      cover_key: "market",
      capacity: "12",
    });
    await command("publish", { confirmed: true });
    const participant = randomUUID();
    await sql(
      "insert into sontu_private.event_participants(id,event_instance_id,display_name,commitment_state) values($1,$2,'Order guest','NO_COMMITMENT')",
      [participant, event],
    );
    const order = randomUUID();
    await sql(
      "insert into sontu_private.event_orders(id,event_instance_id,event_participant_id,state) values($1,$2,$3,'PENDING')",
      [order, event, participant],
    );
    const unrelatedParticipant = randomUUID();
    const unrelatedEvent = randomUUID();
    await sql(
      "insert into sontu_private.event_instances(id,host_owner_user_id,event_kind,lifecycle,current_version_number) values($1,$2,'SIMPLE','DRAFT',1)",
      [unrelatedEvent, host],
    );
    await sql(
      "insert into sontu_private.event_participants(id,event_instance_id,display_name,commitment_state) values($1,$2,'Wrong event','NO_COMMITMENT')",
      [unrelatedParticipant, unrelatedEvent],
    );
    await expect(
      sql(
        "insert into sontu_private.event_orders(event_instance_id,event_participant_id,state) values($1,$2,'PENDING')",
        [event, unrelatedParticipant],
      ),
    ).rejects.toThrow();
    expect(
      await sql(
        "select status from sontu_private.event_admissions where event_participant_id=$1",
        [participant],
      ),
    ).toEqual([]);
    await sql(
      "update sontu_private.event_orders set state='PAID',paid_at=now(),updated_at=now() where id=$1",
      [order],
    );
    expect(
      await sql(
        "select source_kind,status from sontu_private.event_admissions where event_participant_id=$1",
        [participant],
      ),
    ).toEqual([{ source_kind: "ORDER", status: "VALID" }]);
    await sql(
      "update sontu_private.event_participants set commitment_state='CONFIRMED',plus_one_allowance=2 where id=$1",
      [participant],
    );
    expect(
      (
        await sql<{ r: any }>(
          "select public.sontu_host_operational_analytics($1) r",
          [event],
        )
      )[0].r.rsvp,
    ).toMatchObject({ confirmed: 1, reserved_places: 3, remaining_places: 9 });
    expect(
      await sql<{ status: string }>(
        "select c.status from sontu_private.event_credentials c join sontu_private.event_admissions a on a.id=c.admission_id where a.event_participant_id=$1",
        [participant],
      ),
    ).toEqual([{ status: "ACTIVE" }]);
    const credential = await sql<{ id: string }>(
      "select c.id from sontu_private.event_credentials c join sontu_private.event_admissions a on a.id=c.admission_id where a.event_participant_id=$1",
      [participant],
    );
    await sql(
      "update sontu_private.event_instances set lifecycle='IN_PROGRESS' where id=$1",
      [event],
    );
    expect(
      await sql<{ result: { result: string } }>(
        "select sontu_private.check_in_credential_command($1,$2,$3) result",
        [event, credential[0].id, randomUUID()],
      ),
    ).toEqual([{ result: { status: "ready", result: "ADMITTED", participant_id: participant } }]);
    await sql(
      "update sontu_private.event_orders set state='REFUNDED',refunded_at=now(),updated_at=now() where id=$1",
      [order],
    );
    expect(
      await sql(
        "select status,invalidated_at is not null invalidated from sontu_private.event_admissions where event_participant_id=$1",
        [participant],
      ),
    ).toEqual([{ status: "REFUNDED_INVALID", invalidated: true }]);
    expect(
      await sql<{ status: string }>(
        "select c.status from sontu_private.event_credentials c join sontu_private.event_admissions a on a.id=c.admission_id where a.event_participant_id=$1",
        [participant],
      ),
    ).toEqual([{ status: "REVOKED" }]);
    expect(
      await sql(
        "select prior_state,state,source_kind from sontu_private.event_payment_state_history where order_id=$1 order by recorded_at,id",
        [order],
      ),
    ).toEqual([
      { prior_state: null, state: "PENDING", source_kind: "BACKOFFICE" },
      { prior_state: "PENDING", state: "PAID", source_kind: "BACKOFFICE" },
      { prior_state: "PAID", state: "REFUNDED", source_kind: "BACKOFFICE" },
    ]);
    await expect(
      sql("update sontu_private.event_orders set state='PAID' where id=$1", [
        order,
      ]),
    ).rejects.toThrow(/INVALID_ORDER_STATE_TRANSITION/);
    expect(
      await sql<{ allowed: boolean }>(
        "select has_table_privilege('authenticated','sontu_private.event_orders','select') allowed",
      ),
    ).toEqual([{ allowed: false }]);
    expect(
      await sql<{ allowed: boolean }>(
        "select has_table_privilege('authenticated','sontu_private.event_orders','update') allowed",
      ),
    ).toEqual([{ allowed: false }]);
  });

  it("makes management events discoverable without promoting check-in staff", async () => {
    expect(
      await sql<{ allowed: boolean }>(
        "select has_function_privilege('authenticated','sontu_private.event_hub(uuid)','execute') allowed",
      ),
    ).toEqual([{ allowed: true }]);
    expect(
      await sql<{ allowed: boolean }>(
        "select has_function_privilege('anon','sontu_private.event_hub(uuid)','execute') allowed",
      ),
    ).toEqual([{ allowed: false }]);
    await sql(
      "insert into sontu_private.event_team_members(event_instance_id,user_id,role) values($1,$2,'CO_HOST') on conflict(event_instance_id,user_id) do update set role=excluded.role",
      [event, stranger],
    );
    await asHost(stranger);
    expect(
      (
        await sql<{ r: any }>("select public.sontu_my_events() r")
      )[0].r.events.some((item: any) => item.id === event && item.hosting),
    ).toBe(true);
    expect(
      (
        await sql<{ r: any }>("select public.sontu_event_hub($1) r", [event])
      )[0].r.viewer.hosting,
    ).toBe(true);
    await sql(
      "update sontu_private.event_team_members set role='CHECK_IN_STAFF' where event_instance_id=$1 and user_id=$2",
      [event, stranger],
    );
    expect(
      (
        await sql<{ r: any }>("select public.sontu_my_events() r")
      )[0].r.events.some((item: any) => item.id === event),
    ).toBe(false);
    await asHost();
  });

  it("keeps public wrappers executable through their private implementations", async () => {
    const authenticatedFunctions = [
      "sontu_private.host_participant_rsvp(uuid,uuid,text,uuid)",
      "sontu_private.event_operations_command(text,uuid,uuid,uuid,jsonb)",
      "sontu_private.event_team_hub_action(uuid)",
      "sontu_private.event_host_questions(text,uuid,uuid,text)",
      "sontu_private.event_seating(text,uuid,uuid,uuid,text,text,integer)",
      "sontu_private.host_operational_analytics(uuid)",
      "sontu_private.rsvp_form(text,uuid,text,jsonb,uuid)",
      "sontu_private.event_hub_reconfirmation_required(uuid)",
      "sontu_private.event_notification_state(text)",
      "sontu_private.organization_logo(text,uuid,text,uuid)",
    ];
    for (const fn of authenticatedFunctions) {
      expect(
        await sql<{ allowed: boolean }>(
          "select has_function_privilege('authenticated',$1,'execute') allowed",
          [fn],
        ),
      ).toEqual([{ allowed: true }]);
    }
    expect(
      await sql<{ allowed: boolean }>(
        "select has_function_privilege('anon','sontu_private.rsvp_form(text,uuid,text,jsonb,uuid)','execute') allowed",
      ),
    ).toEqual([{ allowed: true }]);
  });
});


