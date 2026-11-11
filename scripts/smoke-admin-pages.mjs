const baseUrl = (process.env.CULTUREFRAME_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const email = process.env.CULTUREFRAME_ADMIN_EMAIL;
const password = process.env.CULTUREFRAME_ADMIN_PASSWORD;

if (!email || !password) {
  throw new Error("Set CULTUREFRAME_ADMIN_EMAIL and CULTUREFRAME_ADMIN_PASSWORD before running this smoke test.");
}

const loginResponse = await fetch(`${baseUrl}/login`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ email, password }),
  redirect: "manual"
});

if (loginResponse.status !== 302) {
  throw new Error(`Administrator login failed with HTTP ${loginResponse.status}.`);
}

const setCookie = loginResponse.headers.getSetCookie?.()[0] || loginResponse.headers.get("set-cookie");
const cookie = setCookie?.split(";", 1)[0];
if (!cookie) throw new Error("Administrator login did not create a session cookie.");

const paths = [
  "/admin/dashboard",
  "/admin/heritage",
  "/admin/heritage/add",
  "/admin/heritage/edit/1",
  "/admin/products",
  "/admin/products/add",
  "/admin/products/edit/1",
  "/admin/orders",
  "/admin/orders/1",
  "/admin/orders/edit/1",
  "/admin/events",
  "/admin/events/add",
  "/admin/events/edit/1",
  "/admin/scenic",
  "/admin/scenic/add",
  "/admin/scenic/edit/1",
  "/admin/crafts",
  "/admin/crafts/add",
  "/admin/crafts/edit/1",
  "/admin/feedbacks",
  "/admin/sellers",
  "/admin/sellers/add",
  "/admin/sellers/edit/1",
  "/admin/customers",
  "/admin/customers/2",
  "/admin/payments",
  "/admin/payments/add",
  "/admin/payments/1",
  "/admin/analytics/sales",
  "/admin/analytics/business"
];

const results = [];
for (const path of paths) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { cookie },
    redirect: "manual"
  });
  const body = await response.text();
  const renderedError = body.includes("Internal Server Error") || body.includes("<h1>Server Error</h1>");
  results.push({ path, status: response.status, ok: response.status === 200 && !renderedError });
}

const failed = results.filter((result) => !result.ok);
console.log(JSON.stringify({ tested: results.length, passed: results.length - failed.length, failed }, null, 2));
if (failed.length) process.exitCode = 1;
