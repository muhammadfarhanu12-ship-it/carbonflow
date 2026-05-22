const http = require("http");
const https = require("https");

const frontendUrl = process.env.SMOKE_FRONTEND_URL || "https://carbonflow-nu.vercel.app";
const backendUrl = process.env.SMOKE_BACKEND_URL || "https://carbonflow-h9cj.onrender.com";
const apiBase = process.env.SMOKE_API_BASE || "https://carbonflow-h9cj.onrender.com/api";
const email = process.env.SMOKE_TEST_EMAIL || "";
const password = process.env.SMOKE_TEST_PASSWORD || "";
const runMutatingTests = String(process.env.SMOKE_RUN_MUTATING_TESTS || "false").toLowerCase() === "true";

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "http:" ? http : https;
    const body = options.body ? JSON.stringify(options.body) : null;
    const req = client.request(parsed, {
      method: options.method || "GET",
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      timeout: 30000,
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let payload = text;
        try {
          payload = text ? JSON.parse(text) : null;
        } catch {
          payload = text;
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, payload });
      });
    });
    req.on("timeout", () => req.destroy(new Error(`Request timed out: ${url}`)));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function expectStatus(label, promise, allowedStatuses) {
  const response = await promise;
  if (!allowedStatuses.includes(response.statusCode)) {
    throw new Error(`${label} expected ${allowedStatuses.join("/")} but got ${response.statusCode}`);
  }
  console.log(`ok - ${label} (${response.statusCode})`);
  return response;
}

async function main() {
  console.log("CarbonFlow Optimization smoke test");
  console.log(`Frontend: ${frontendUrl}`);
  console.log(`Backend: ${backendUrl}`);
  console.log(`API: ${apiBase}`);

  await expectStatus("backend health", requestJson(`${backendUrl.replace(/\/$/, "")}/health`), [200, 503]);
  await expectStatus("frontend reachable", requestJson(frontendUrl), [200, 301, 302, 307, 308]);
  await expectStatus("optimization context protected", requestJson(`${apiBase}/optimization/context`), [401]);
  await expectStatus("optimization analyze protected", requestJson(`${apiBase}/optimization/analyze`, { method: "POST", body: { question: "routes" } }), [401]);
  await expectStatus("optimization export protected", requestJson(`${apiBase}/optimization/runs/smoke/download/CSV`), [401]);

  const frontendText = await requestJson(frontendUrl);
  if (typeof frontendText.payload === "string" && /localhost:|127\.0\.0\.1/.test(frontendText.payload)) {
    throw new Error("Production frontend response contains localhost reference");
  }
  console.log("ok - no localhost reference in fetched frontend shell");

  if (!runMutatingTests) {
    console.log("Skipping mutating authenticated checks. Set SMOKE_RUN_MUTATING_TESTS=true with SMOKE_TEST_EMAIL and SMOKE_TEST_PASSWORD to run them.");
    return;
  }

  if (!email || !password) {
    throw new Error("SMOKE_TEST_EMAIL and SMOKE_TEST_PASSWORD are required for mutating smoke tests");
  }

  const login = await expectStatus("login smoke user", requestJson(`${apiBase}/auth/login`, {
    method: "POST",
    body: { email, password },
  }), [200]);
  const token = login.payload?.data?.accessToken || login.payload?.data?.token || login.payload?.accessToken || login.payload?.token;
  if (!token) throw new Error("Login did not return an access token");

  await expectStatus("fetch optimization context", requestJson(`${apiBase}/optimization/context`, { token }), [200]);
  const analysis = await expectStatus("run route optimization query", requestJson(`${apiBase}/optimization/analyze`, {
    method: "POST",
    token,
    body: { question: "Identify top emitting routes" },
  }), [200]);
  const runId = analysis.payload?.data?.runId;
  const recommendations = analysis.payload?.data?.recommendations || [];
  console.log(`ok - recommendation count: ${recommendations.length}`);

  if (runId) {
    await expectStatus("export optimization CSV", requestJson(`${apiBase}/optimization/runs/${runId}/download/CSV`, { token }), [200]);
  }
}

main().catch((error) => {
  console.error(`not ok - ${error.message}`);
  process.exit(1);
});
