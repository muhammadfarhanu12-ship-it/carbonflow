#!/usr/bin/env node
/* eslint-disable no-console */
const DEFAULTS = {
  SMOKE_FRONTEND_URL: "https://carbonflow-nu.vercel.app",
  SMOKE_BACKEND_URL: "https://carbonflow-h9cj.onrender.com",
  SMOKE_API_BASE: "https://carbonflow-h9cj.onrender.com/api",
};

function readConfig(env = process.env) {
  const mutating = String(env.SMOKE_RUN_MUTATING_TESTS || "false").toLowerCase() === "true";
  const config = {
    frontendUrl: env.SMOKE_FRONTEND_URL || DEFAULTS.SMOKE_FRONTEND_URL,
    backendUrl: env.SMOKE_BACKEND_URL || DEFAULTS.SMOKE_BACKEND_URL,
    apiBase: env.SMOKE_API_BASE || DEFAULTS.SMOKE_API_BASE,
    email: env.SMOKE_TEST_EMAIL || "",
    password: env.SMOKE_TEST_PASSWORD || "",
    mutating,
  };
  if (mutating && (!config.email || !config.password)) {
    throw new Error("SMOKE_TEST_EMAIL and SMOKE_TEST_PASSWORD are required when SMOKE_RUN_MUTATING_TESTS=true");
  }
  return config;
}

async function checkFetch(name, url, options = {}, expectedStatuses = [200]) {
  const response = await fetch(url, options);
  const ok = expectedStatuses.includes(response.status);
  return { name, url, status: response.status, ok };
}

async function runNonMutating(config) {
  return Promise.all([
    checkFetch("frontend reachable", config.frontendUrl, {}, [200, 304]),
    checkFetch("backend health", `${config.backendUrl.replace(/\/$/, "")}/api/health`, {}, [200, 503]),
    checkFetch("api base reachable", `${config.apiBase.replace(/\/$/, "")}/health`, {}, [200, 503, 404]),
    checkFetch("unauthorized ledger blocked", `${config.apiBase}/ledger`, {}, [401, 403]),
    checkFetch("unauthorized emissions blocked", `${config.apiBase}/emissions`, {}, [401, 403]),
    checkFetch("report endpoint protected", `${config.apiBase}/reports/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }, [401, 403]),
  ]);
}

async function login(config) {
  const response = await fetch(`${config.apiBase}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: config.email, password: config.password }),
  });
  if (!response.ok) throw new Error(`Login failed with ${response.status}`);
  const payload = await response.json();
  return payload.data?.token || payload.data?.accessToken || payload.token || payload.accessToken;
}

async function runMutating(config) {
  const token = await login(config);
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const createdRecord = await fetch(`${config.apiBase}/emissions/activities`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      scope: 1,
      category: "Stationary combustion",
      activityType: "stationary_fuel",
      activityAmount: 1,
      activityUnit: "liter",
      factorKey: "DIESEL",
      reportingPeriod: "smoke-test",
      occurredAt: new Date().toISOString(),
      dataStatus: "draft",
      description: "Carbon Ledger smoke test record",
    }),
  });
  const report = await fetch(`${config.apiBase}/reports/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: `Carbon Ledger Smoke ${new Date().toISOString()}`,
      type: "CUSTOM",
      format: "CSV",
      metadata: { generatedFrom: "carbon_ledger", approvedOnly: true, smokeTest: true },
    }),
  });
  return [
    { name: "mutating login", status: 200, ok: true },
    { name: "create draft smoke record", status: createdRecord.status, ok: createdRecord.ok },
    { name: "generate smoke report", status: report.status, ok: report.ok },
  ];
}

async function runSmoke(config = readConfig()) {
  const results = await runNonMutating(config);
  if (config.mutating) {
    results.push(...await runMutating(config));
  }
  return results;
}

if (require.main === module) {
  runSmoke()
    .then((results) => {
      results.forEach((result) => console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}: ${result.status} ${result.url || ""}`));
      if (results.some((result) => !result.ok)) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  readConfig,
  runSmoke,
  runNonMutating,
};
