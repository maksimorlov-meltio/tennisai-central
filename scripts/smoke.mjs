#!/usr/bin/env node
// ============================================================
// TennisAI — deployment smoke test
//
// Verifies a deployed API is actually usable, not merely reachable.
// No dependencies: Node's built-in fetch, run it straight from the repo.
//
//   node scripts/smoke.mjs https://tennisai-api.onrender.com
//   node scripts/smoke.mjs http://localhost:4000 --skip-signup
//
// ⚠️  Without --skip-signup this CREATES A REAL ACCOUNT on the target, which
//     consumes one MAX_SIGNUPS seat. The address is obviously synthetic
//     (smoke+<timestamp>@synthetic.test) so it is easy to find and delete.
//     Delete it afterwards:
//       delete from users where email like 'smoke+%@synthetic.test';
// ============================================================

const base = (process.argv[2] || "").replace(/\/+$/, "");
const skipSignup = process.argv.includes("--skip-signup");

if (!base) {
  console.error("usage: node scripts/smoke.mjs <api-base-url> [--skip-signup]");
  console.error("   e.g. node scripts/smoke.mjs https://tennisai-api.onrender.com");
  process.exit(2);
}

const api = base.endsWith("/api") ? base : `${base}/api`;
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Never throws: a failed request is a failed check, not a crashed script. */
async function call(method, path, body) {
  try {
    const res = await fetch(`${api}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60_000), // free dynos cold-start slowly
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON body — status still tells us what we need */
    }
    return { status: res.status, json };
  } catch (err) {
    return { status: 0, json: null, error: err instanceof Error ? err.message : String(err) };
  }
}

console.log(`\nSmoke-testing ${api}\n`);

// 1. Health — also warms a sleeping dyno before anything is timed.
{
  const t0 = Date.now();
  const r = await call("GET", "/health");
  const ms = Date.now() - t0;
  const ok = r.status === 200 && r.json?.ok === true && r.json?.db === "up";
  record(
    "GET /health → { ok: true, db: 'up' }",
    ok,
    r.error ?? `status ${r.status}, db=${r.json?.db ?? "?"}, emailEnabled=${r.json?.emailEnabled}, ${ms}ms`,
  );
  if (r.json?.emailEnabled === false) {
    console.log(
      "   ⚠️  emailEnabled=false — no Gmail credentials. Verification links are only logged,\n" +
        "      so with REQUIRE_EMAIL_VERIFICATION=true nobody can complete signup.",
    );
  }
}

// 2/3. Signup, then login before verifying.
if (skipSignup) {
  console.log("⏭️  signup + login checks skipped (--skip-signup)");
} else {
  const email = `smoke+${Date.now()}@synthetic.test`;
  const password = "smoke-test-correct-horse";

  const signup = await call("POST", "/auth/signup", {
    email,
    password,
    firstName: "Smoke",
    lastName: "Test",
    role: "player",
    ageConfirmed: true,
    termsAccepted: true,
  });
  const signedUp = signup.status === 201;
  record("POST /auth/signup → 201", signedUp, signup.error ?? `status ${signup.status} ${signup.json?.message ?? ""}`);
  if (signup.status === 403) {
    console.log("   ℹ️  403 usually means MAX_SIGNUPS is reached — raise it or delete a test account.");
  }

  if (signedUp) {
    console.log(`   created ${email} — delete it when you are done`);
    const login = await call("POST", "/auth/login", { email, password });
    // 403 is the CORRECT answer while the address is unverified. A 200 here
    // means REQUIRE_EMAIL_VERIFICATION is off on this deployment.
    const ok = login.status === 403;
    record(
      "POST /auth/login before verifying → 403",
      ok,
      login.status === 200
        ? "got 200 — REQUIRE_EMAIL_VERIFICATION is OFF on this deployment"
        : `status ${login.status}`,
    );
  }
}

// 4. Password reset must always answer the same way, so it cannot be used to
//    discover which addresses are registered.
{
  const r = await call("POST", "/auth/forgot-password", { email: "definitely-not-registered@synthetic.test" });
  const ok = r.status === 200;
  record("POST /auth/forgot-password → generic 200", ok, r.error ?? `status ${r.status}`);
}

// 5. CORS — the most common production failure, and invisible from curl.
{
  const r = await call("GET", "/health");
  record("API reachable for the CORS check", r.status === 200, `status ${r.status}`);
  console.log(
    "   ℹ️  CORS itself can only be confirmed from a browser on the deployed frontend.\n" +
      "      If requests fail there with a CORS error, APP_URL does not exactly match the site origin.",
  );
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed\n`);
process.exit(failed.length === 0 ? 0 : 1);
