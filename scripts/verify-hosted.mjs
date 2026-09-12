import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const accounts = JSON.parse(
  readFileSync(process.env.SONTU_TEST_ACCOUNTS_FILE, "utf8"),
);
if (accounts.some((a) => !a.email.endsWith("@sontu.example")))
  throw new Error("This harness only accepts synthetic Sontu test accounts");
const url = "https://zukfxasttgmtygnsqqav.supabase.co",
  key = "sb_publishable_HOaki0v0jS9BmMSv8MuQng_Oh4X39wm";
const host = createClient(url, key, { auth: { persistSession: false } }),
  stranger = createClient(url, key, { auth: { persistSession: false } }),
  guest = createClient(url, key, { auth: { persistSession: false } });
for (const [i, client] of [host, stranger].entries()) {
  const r = await client.auth.signInWithPassword({
    email: accounts[i].email,
    password: accounts[i].password,
  });
  assert.equal(r.error, null);
}
let event = null,
  version = 1;
async function cmd(
  command,
  input = {},
  expected = version,
  op = randomUUID(),
  client = host,
) {
  const r = await client.rpc("sontu_host_command", {
    cmd: command,
    event_id: event,
    expected_version: expected,
    operation_id: op,
    input,
  });
  assert.equal(r.error, null);
  if (r.data.status === "ready" && r.data.current_version)
    version = r.data.current_version;
  return r.data;
}
async function read() {
  const r = await host.rpc("sontu_host_projection", { event_id: event });
  assert.equal(r.error, null);
  return r.data;
}
const created = await cmd("create_fixture");
assert.equal(created.status, "ready");
event = created.event_id;
assert.ok(
  (
    await host.rpc("sontu_host_projection", { event_id: null })
  ).data.events.some((e) => e.id === event),
);
assert.equal((await cmd("publish")).status, "ready");
await cmd("change_time", {
  confirmed: true,
  starts_at: "2026-09-16T23:30:00Z",
});
await cmd("accept", { confirmed: true });
let p = (await read()).data;
assert.equal(p.cases[0].disposition, "OPEN_UNRESOLVED");
await cmd("simulate_delivery", { delivery_status: "DELIVERED" });
assert.equal((await read()).data.cases[0].disposition, "OPEN_UNRESOLVED");
const tokens = [];
for (let i = 0; i < 12; i++) {
  const token = randomBytes(32).toString("hex");
  tokens.push(token);
  assert.equal(
    (await cmd("issue_link", { participant_id: p.participants[i].id, token }))
      .status,
    "ready",
  );
  if (i < 11) {
    const args = {
      token,
      decision: i === 10 ? "RELEASED_DECLINED" : "RECONFIRMED",
      expected_version: version,
      operation_id: randomUUID(),
    };
    const a = await guest.rpc("sontu_participant_access", args);
    assert.equal(a.data.status, "ready");
    assert.deepEqual(
      (await guest.rpc("sontu_participant_access", args)).data,
      a.data,
    );
  }
}
p = (await read()).data;
assert.equal(p.cases[0].disposition, "OPEN_UNRESOLVED");
assert.equal(
  p.participants.filter((p) => p.response === "AWAITING_RESPONSE").length,
  1,
);
assert.equal(
  (await cmd("cancel", { confirmed: true }, version, randomUUID(), stranger))
    .status,
  "denied",
);
const anonHost = await guest.rpc("sontu_host_projection", { event_id: event });
assert.ok(anonHost.error);
const direct = await host
  .schema("sontu_private")
  .from("event_instances")
  .select("*");
assert.ok(direct.error);
await guest.rpc("sontu_participant_access", {
  token: tokens[11],
  decision: "RECONFIRMED",
  expected_version: version,
  operation_id: randomUUID(),
});
assert.equal((await read()).data.cases[0].disposition, "RESOLVED");
const old = version;
await cmd("change_time", {
  confirmed: true,
  starts_at: "2026-09-17T00:00:00Z",
});
assert.equal(
  (await cmd("cancel", { confirmed: true }, old)).error_code,
  "STALE_CONFLICT",
);
p = (await read()).data;
assert.equal(p.cases[0].disposition, "OPEN_UNRESOLVED");
assert.equal(
  p.participants.filter((p) => p.response === "AWAITING_RESPONSE").length,
  11,
);
const concurrent = await Promise.all([
  cmd(
    "change_time",
    { confirmed: true, starts_at: "2026-09-17T00:10:00Z" },
    version,
  ),
  cmd(
    "change_time",
    { confirmed: true, starts_at: "2026-09-17T00:15:00Z" },
    version,
  ),
]);
assert.equal(concurrent.filter((r) => r.status === "ready").length, 1);
assert.equal(
  concurrent.filter((r) => r.error_code === "STALE_CONFLICT").length,
  1,
);
writeFileSync(
  process.env.SONTU_VERIFICATION_REPORT ??
    "/tmp/sontu-remote-verification.json",
  JSON.stringify(
    {
      event,
      checks: [
        "Auth sign-in",
        "host list",
        "publish",
        "material change",
        "explicit acceptance",
        "delivery not settlement",
        "11/12 unresolved",
        "participant retries",
        "unrelated host denied",
        "anonymous host read denied",
        "direct table access denied",
        "12/12 resolved",
        "new material version reopens",
        "stale edit rejected",
        "concurrent edit only one wins",
      ],
      passed: true,
    },
    null,
    2,
  ),
);
console.log(
  "Remote verification passed: authenticated Auth + RPC workflow, ownership, participant scope, retries, partial settlement, reopening and concurrent edits.",
);
