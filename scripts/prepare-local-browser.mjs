// Disposable local Supabase only. Never creates users on a hosted project.
import { appendFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
const rawStatus = process.platform === "win32"
  ? execFileSync(
      process.env.ComSpec || "cmd.exe",
      ["/d", "/s", "/c", "npx.cmd supabase status -o json"],
      { encoding: "utf8" },
    )
  : execFileSync("npx", ["supabase", "status", "-o", "json"], {
      encoding: "utf8",
    });
const status = JSON.parse(rawStatus.slice(rawStatus.indexOf("{")));
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(status.API_URL))
  throw new Error("Local test setup refuses hosted targets");
const password = randomBytes(24).toString("base64url") + "Aa1!";
const email = `browser-test-${Date.now()}@sontu.example`;
const secondaryEmail = `browser-secondary-${Date.now()}@sontu.example`;
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
for (const accountEmail of [email, secondaryEmail]) {
  const { error } = await admin.auth.admin.createUser({
    email: accountEmail,
    password,
    email_confirm: true,
  });
  if (error) throw error;
}
const client = createClient(status.API_URL, status.ANON_KEY, {
  auth: { persistSession: false },
});
for (const [accountEmail, firstName] of [
  [email, "Beta tester"],
  [secondaryEmail, "Second tester"],
]) {
  const signIn = await client.auth.signInWithPassword({
    email: accountEmail,
    password,
  });
  if (signIn.error) throw signIn.error;
  const profile = await client.rpc("sontu_account_profile", {
    action: "create",
    input: { first_name: firstName },
  });
  if (profile.error || profile.data.status !== "ready")
    throw new Error("Profile provisioning failed");
  await client.auth.signOut();
}
console.log("::add-mask::" + password);
const environment = `VITE_REGISTRATION_ENABLED=true\nVITE_INVITATION_VERIFICATION_ENABLED=true\nSONTU_TEST_MAIL_URL=${status.MAILPIT_URL}\nVITE_SUPABASE_URL=${status.API_URL}\nVITE_SUPABASE_PUBLISHABLE_KEY=${status.ANON_KEY}\nSONTU_TEST_EMAIL=${email}\nSONTU_TEST_PASSWORD=${password}\nSONTU_TEST_SECONDARY_EMAIL=${secondaryEmail}\nSONTU_TEST_SECONDARY_PASSWORD=${password}\nSONTU_TEST_API=${status.API_URL}\nSONTU_TEST_KEY=${status.ANON_KEY}\n`;
writeFileSync(".env.browser.local", environment);
if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, environment);
console.log("Prepared disposable local browser credentials in .env.browser.local");
