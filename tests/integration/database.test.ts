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
    "create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated;",
  );
  await sql("insert into auth.users values($1),($2)", [host, stranger]);
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
