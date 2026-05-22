const DEFAULTS = {
  frontendUrl: process.env.SMOKE_FRONTEND_URL || "https://carbonflow-nu.vercel.app",
  adminUrl: process.env.SMOKE_ADMIN_URL || "https://carbonflow-admin.vercel.app",
  backendUrl: process.env.SMOKE_BACKEND_URL || "https://carbonflow-h9cj.onrender.com",
  apiBase: process.env.SMOKE_API_BASE || "https://carbonflow-h9cj.onrender.com/api",
  email: process.env.SMOKE_TEST_EMAIL || "",
  password: process.env.SMOKE_TEST_PASSWORD || "",
  runMutating: process.env.SMOKE_RUN_MUTATING_TESTS === "true",
};

async function request(url, options = {}) {
  const response = await fetch(url, {
    redirect: "manual",
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  return { response, text };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectProtected(path, method = "GET") {
  const { response } = await request(`${DEFAULTS.apiBase}${path}`, { method });
  assert([401, 403].includes(response.status), `${method} ${path} should be protected, got ${response.status}`);
  console.log(`ok - ${method} ${path} is protected`);
}

async function main() {
  const health = await request(`${DEFAULTS.apiBase}/health`);
  assert([200, 503].includes(health.response.status), `health returned ${health.response.status}`);
  console.log(`ok - backend health reachable (${health.response.status})`);

  const frontend = await request(DEFAULTS.frontendUrl);
  assert(frontend.response.status < 400, `frontend returned ${frontend.response.status}`);
  assert(!/localhost:|127\.0\.0\.1/.test(frontend.text), "frontend shell contains localhost reference");
  console.log("ok - frontend shell has no localhost reference");

  const admin = await request(DEFAULTS.adminUrl);
  assert(admin.response.status < 400, `admin returned ${admin.response.status}`);
  assert(!/localhost:|127\.0\.0\.1/.test(admin.text), "admin shell contains localhost reference");
  console.log("ok - admin shell has no localhost reference");

  await expectProtected("/marketplace/listings");
  await expectProtected("/marketplace/budget");
  await expectProtected("/marketplace/checkout", "POST");
  await expectProtected("/credits/test/certificate");
  await expectProtected("/admin/marketplace?companyId=test");

  if (!DEFAULTS.runMutating) {
    console.log("ok - mutating marketplace smoke tests skipped. Set SMOKE_RUN_MUTATING_TESTS=true to enable.");
    return;
  }

  assert(DEFAULTS.email && DEFAULTS.password, "SMOKE_TEST_EMAIL and SMOKE_TEST_PASSWORD are required for mutating tests.");
  throw new Error("Mutating marketplace smoke flow requires project-specific test-company setup before enabling in production.");
}

main().catch((error) => {
  console.error(`marketplace smoke failed: ${error.message}`);
  process.exitCode = 1;
});
