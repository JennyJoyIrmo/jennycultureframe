const baseUrl = (process.env.CULTUREFRAME_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

async function login(email, password) {
  if (!email || !password) throw new Error("Customer and seller smoke-test credentials are required.");
  const response = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password }),
    redirect: "manual"
  });
  if (response.status !== 302) throw new Error(`Login for ${email} failed with HTTP ${response.status}.`);
  const setCookie = response.headers.getSetCookie?.()[0] || response.headers.get("set-cookie");
  const cookie = setCookie?.split(";", 1)[0];
  if (!cookie) throw new Error(`Login for ${email} did not create a session cookie.`);
  return cookie;
}

async function check(path, cookie) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual"
  });
  const body = await response.text();
  const renderedError = body.includes("Internal Server Error") || body.includes("<h1>Server Error</h1>");
  return { path, status: response.status, ok: response.status === 200 && !renderedError };
}

const customerCookie = await login(
  process.env.CULTUREFRAME_CUSTOMER_EMAIL,
  process.env.CULTUREFRAME_CUSTOMER_PASSWORD
);
const sellerCookie = await login(
  process.env.CULTUREFRAME_SELLER_EMAIL,
  process.env.CULTUREFRAME_SELLER_PASSWORD
);

const publicPaths = [
  "/",
  "/heritage",
  "/heritage/1",
  "/shop",
  "/shop/product/1",
  "/events",
  "/events/1",
  "/scenic",
  "/scenic/1",
  "/crafts",
  "/crafts/1",
  "/discover",
  "/discover/heritage",
  "/discover/heritage/integration-mangyan-heritage"
];
const customerPaths = [
  "/customer/dashboard",
  "/customer/events",
  "/customer/profile",
  "/customer/profile/edit",
  "/customer/moments",
  "/customer/photos",
  "/customer/orders",
  "/customer/orders/1",
  "/cart",
  "/wishlist"
];
const sellerPaths = [
  "/seller/dashboard",
  "/seller/products",
  "/seller/products/add",
  "/seller/products/edit/1",
  "/seller/categories"
];

const results = [];
for (const path of publicPaths) results.push(await check(path));
for (const path of customerPaths) results.push(await check(path, customerCookie));
for (const path of sellerPaths) results.push(await check(path, sellerCookie));

const failed = results.filter((result) => !result.ok);
console.log(JSON.stringify({ tested: results.length, passed: results.length - failed.length, failed }, null, 2));
if (failed.length) process.exitCode = 1;
