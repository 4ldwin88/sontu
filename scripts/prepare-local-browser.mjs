// Disposable local Supabase only. Never creates users on a hosted project.
import { readFileSync, appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const status = JSON.parse(readFileSync("/tmp/sontu-local-status.json", "utf8"));
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(status.API_URL))
  throw new Error("Local test setup refuses hosted targets");
const password = randomBytes(24).toString("base64url");
const email = "browser-test@sontu.example";
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (error) throw error;
console.log("::add-mask::" + password);
appendFileSync(
  process.env.GITHUB_ENV,
  `VITE_INVITATION_VERIFICATION_ENABLED=true\nSONTU_TEST_MAIL_URL=http://127.0.0.1:54324\nVITE_SUPABASE_URL=${status.API_URL}\nVITE_SUPABASE_PUBLISHABLE_KEY=${status.ANON_KEY}\nSONTU_TEST_EMAIL=${email}\nSONTU_TEST_PASSWORD=${password}\nSONTU_TEST_API=${status.API_URL}\nSONTU_TEST_KEY=${status.ANON_KEY}\n`,
);
