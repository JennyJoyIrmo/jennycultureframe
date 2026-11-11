import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.SKIP_DATABASE_AUTHENTICATION = "true";

const {
  getAnalyticsOverview,
  getAnalyticsCustomers,
  listAnalyticsOrders,
  listAnalyticsProducts,
  listAnalyticsEvents,
  listAnalyticsHeritage,
  listAnalyticsScenic,
  parseAnalyticsQuery
} = await import("../services/analyticsIntegrationService.js");
const {
  createCultureMetricsRateLimiter,
  requireCultureMetricsToken
} = await import("../middleware/cultureMetricsAuth.js");
const { Order } = await import("../models/Order.js");
const { OrderItem } = await import("../models/Orderitem.js");
const { Product } = await import("../models/Product.js");
const { User } = await import("../models/userModel.js");
const { Event } = await import("../models/Event.js");
const { EventRegistration } = await import("../models/EventRegistration.js");
const { Heritage } = await import("../models/Heritage.js");
const { Scenic } = await import("../models/Scenic.js");
const { Payment } = await import("../models/Payment.js");
const { default: analyticsIntegrationRouter } = await import("../routes/analyticsIntegration.js");

function responseDouble() {
  const response = { statusCode: 200, body: null, headers: {} };
  response.status = code => { response.statusCode = code; return response; };
  response.json = body => { response.body = body; return response; };
  response.set = (name, value) => { response.headers[name] = value; return response; };
  return response;
}

test("CultureMetrics requires a dedicated strong bearer token", () => {
  const previous = process.env.CULTUREMETRICS_INTEGRATION_TOKEN;
  try {
    process.env.CULTUREMETRICS_INTEGRATION_TOKEN = "a-culturemetrics-test-token-longer-than-32-characters";

    const missing = responseDouble();
    requireCultureMetricsToken({ get: () => "" }, missing, () => {});
    assert.equal(missing.statusCode, 401);
    assert.equal(missing.body.error.code, "UNAUTHORIZED");

    const invalid = responseDouble();
    requireCultureMetricsToken({ get: () => "Bearer wrong-token" }, invalid, () => {});
    assert.equal(invalid.statusCode, 401);

    let continued = false;
    const accepted = responseDouble();
    requireCultureMetricsToken({
      get: name => name === "authorization" ? `Bearer ${process.env.CULTUREMETRICS_INTEGRATION_TOKEN}` : ""
    }, accepted, () => { continued = true; });
    assert.equal(continued, true);
  } finally {
    if (previous === undefined) delete process.env.CULTUREMETRICS_INTEGRATION_TOKEN;
    else process.env.CULTUREMETRICS_INTEGRATION_TOKEN = previous;
  }
});

test("CultureMetrics rate limiting returns the documented structured error", () => {
  const limiter = createCultureMetricsRateLimiter({ limit: 1, windowMs: 60_000 });
  let continued = 0;
  limiter({}, responseDouble(), () => { continued += 1; });
  const blocked = responseDouble();
  limiter({}, blocked, () => { continued += 1; });

  assert.equal(continued, 1);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.body.error.code, "RATE_LIMITED");
  assert.ok(blocked.headers["Retry-After"]);
});

test("analytics query validation rejects invalid dates and oversized pages", () => {
  assert.throws(
    () => parseAnalyticsQuery({ startDate: "2026-02-30" }),
    error => error.status === 400 && error.code === "INVALID_DATE_RANGE"
  );
  assert.throws(
    () => parseAnalyticsQuery({ startDate: "2026-11-02", endDate: "2026-11-01" }),
    error => error.status === 400 && error.code === "INVALID_DATE_RANGE"
  );
  assert.throws(
    () => parseAnalyticsQuery({ limit: "201" }, { pagination: true }),
    error => error.status === 400 && error.code === "INVALID_QUERY"
  );
});

test("orders follow the CultureMetrics contract without customer personal data", async () => {
  const originals = {
    orders: Order.findAndCountAll,
    items: OrderItem.findAll,
    products: Product.findAll,
    payments: Payment.findAll
  };
  try {
    Order.findAndCountAll = async () => ({
      count: 1,
      rows: [{
        id: 15,
        customer_name: "Must Not Leave CultureFrame",
        customer_email: "private@example.com",
        shipping_address: "Private address",
        total_amount: "500.00",
        status: "delivered",
        payment_status: "paid",
        createdAt: new Date("2026-11-01T01:00:00.000Z"),
        updatedAt: new Date("2026-11-01T02:00:00.000Z")
      }]
    });
    OrderItem.findAll = async () => [{ order_id: 15, product_id: 7, product_name: "Handwoven Basket", quantity: 2, price: "250.00" }];
    Product.findAll = async () => [{ id: 7, category: "Handicrafts" }];
    Payment.findAll = async () => [{ order_id: 15, refunded_amount: "25.00" }];

    const result = await listAnalyticsOrders({ page: "1", limit: "50" });
    assert.equal(result.data[0].status, "completed");
    assert.equal(result.data[0].subtotal, "500.00");
    assert.equal(result.data[0].refundAmount, "25.00");
    assert.equal(result.data[0].items[0].category, "Handicrafts");
    assert.equal(result.pagination.totalPages, 1);
    assert.equal(JSON.stringify(result).includes("private@example.com"), false);
    assert.equal(Object.hasOwn(result.data[0], "customer_name"), false);
  } finally {
    Order.findAndCountAll = originals.orders;
    OrderItem.findAll = originals.items;
    Product.findAll = originals.products;
    Payment.findAll = originals.payments;
  }
});

test("products aggregate only qualifying paid or completed sales", async () => {
  const originals = {
    products: Product.findAndCountAll,
    items: OrderItem.findAll,
    orders: Order.findAll
  };
  try {
    Product.findAndCountAll = async () => ({
      count: 1,
      rows: [{ id: 7, name: "Handwoven Basket", category: "Handicrafts", price: "250.00", stocks: 8, status: "active" }]
    });
    OrderItem.findAll = async () => [
      { order_id: 10, product_id: 7, quantity: 2, price: "250.00" },
      { order_id: 11, product_id: 7, quantity: 9, price: "250.00" }
    ];
    Order.findAll = async () => [
      { id: 10, status: "delivered", payment_status: "unpaid" },
      { id: 11, status: "cancelled", payment_status: "unpaid" }
    ];

    const result = await listAnalyticsProducts({});
    assert.equal(result.data[0].unitsSold, 2);
    assert.equal(result.data[0].totalRevenue, "500.00");
    assert.equal(result.data[0].isAvailable, true);
  } finally {
    Product.findAndCountAll = originals.products;
    OrderItem.findAll = originals.items;
    Order.findAll = originals.orders;
  }
});

test("customer analytics exposes aggregate counts only", async () => {
  const originals = { count: User.count, users: User.findAll, orders: Order.findAll };
  try {
    User.count = async () => 10;
    User.findAll = async () => [
      { createdAt: new Date("2026-11-01T01:00:00.000Z") },
      { createdAt: new Date("2026-11-01T03:00:00.000Z") }
    ];
    Order.findAll = async () => [
      { user_id: 2, status: "delivered", payment_status: "unpaid" },
      { user_id: 2, status: "shipped", payment_status: "paid" },
      { user_id: 3, status: "cancelled", payment_status: "unpaid" }
    ];

    const result = await getAnalyticsCustomers({ startDate: "2026-11-01", endDate: "2026-11-30" });
    assert.deepEqual(result.data, {
      totalRegistered: 10,
      newThisPeriod: 2,
      withAtLeastOneOrder: 1,
      repeatCustomers: 1,
      registrationsByDate: [{ date: "2026-11-01", count: 2 }]
    });
    assert.equal(JSON.stringify(result).includes("email"), false);
  } finally {
    User.count = originals.count;
    User.findAll = originals.users;
    Order.findAll = originals.orders;
  }
});

test("overview totals use qualifying orders and operational counts", async () => {
  const originals = {
    orders: Order.findAll,
    products: Product.count,
    users: User.count,
    registrations: EventRegistration.count,
    heritage: Heritage.count,
    scenic: Scenic.count
  };
  try {
    Order.findAll = async () => [
      { id: 1, total_amount: "100.00", status: "delivered", payment_status: "unpaid" },
      { id: 2, total_amount: "50.00", status: "shipped", payment_status: "paid" },
      { id: 3, total_amount: "75.00", status: "cancelled", payment_status: "unpaid" }
    ];
    Product.count = async () => 4;
    User.count = async () => 8;
    EventRegistration.count = async () => 12;
    Heritage.count = async () => 3;
    Scenic.count = async () => 5;

    const result = await getAnalyticsOverview({});
    assert.deepEqual(result.data, {
      totalRevenue: "150.00",
      totalOrders: 3,
      completedOrders: 1,
      totalProducts: 4,
      totalCustomers: 8,
      totalEventRegistrations: 12,
      totalHeritageSites: 3,
      totalScenicDestinations: 5
    });
  } finally {
    Order.findAll = originals.orders;
    Product.count = originals.products;
    User.count = originals.users;
    EventRegistration.count = originals.registrations;
    Heritage.count = originals.heritage;
    Scenic.count = originals.scenic;
  }
});

test("the authenticated overview HTTP route serves the shared contract", async () => {
  const originals = {
    orders: Order.findAll,
    products: Product.count,
    users: User.count,
    registrations: EventRegistration.count,
    heritage: Heritage.count,
    scenic: Scenic.count
  };
  const previousToken = process.env.CULTUREMETRICS_INTEGRATION_TOKEN;
  let server;
  try {
    Order.findAll = async () => [{ id: 1, total_amount: "250.00", status: "delivered", payment_status: "paid" }];
    Product.count = async () => 1;
    User.count = async () => 2;
    EventRegistration.count = async () => 3;
    Heritage.count = async () => 4;
    Scenic.count = async () => 5;
    process.env.CULTUREMETRICS_INTEGRATION_TOKEN = "http-contract-test-token-that-is-longer-than-32-characters";

    const app = express();
    app.use("/api/integrations/analytics", analyticsIntegrationRouter);
    server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const address = server.address();
    const url = `http://127.0.0.1:${address.port}/api/integrations/analytics/overview`;

    const unauthorized = await fetch(url);
    assert.equal(unauthorized.status, 401);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.CULTUREMETRICS_INTEGRATION_TOKEN}` }
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.data.totalRevenue, "250.00");
    assert.equal(body.data.totalOrders, 1);
    assert.equal(response.headers.get("ratelimit-limit"), "120");
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    Order.findAll = originals.orders;
    Product.count = originals.products;
    User.count = originals.users;
    EventRegistration.count = originals.registrations;
    Heritage.count = originals.heritage;
    Scenic.count = originals.scenic;
    if (previousToken === undefined) delete process.env.CULTUREMETRICS_INTEGRATION_TOKEN;
    else process.env.CULTUREMETRICS_INTEGRATION_TOKEN = previousToken;
  }
});

test("events, heritage, and scenic responses preserve unknown tracking as null", async () => {
  const originals = {
    events: Event.findAndCountAll,
    registrations: EventRegistration.findAll,
    heritage: Heritage.findAndCountAll,
    scenic: Scenic.findAndCountAll
  };
  try {
    Event.findAndCountAll = async () => ({ count: 1, rows: [{ id: 1, title: "Future Festival", event_date: new Date("2099-01-01T00:00:00.000Z") }] });
    EventRegistration.findAll = async () => [{ event_id: 1 }, { event_id: 1 }];
    Heritage.findAndCountAll = async () => ({ count: 1, rows: [{ id: 2, title: "Heritage Site", category: "Landmark", location: "Mansalay", status: "active" }] });
    Scenic.findAndCountAll = async () => ({ count: 1, rows: [{ id: 3, title: "Scenic Place", latitude: null, longitude: "121.4", status: "inactive" }] });

    const [events, heritage, scenic] = await Promise.all([
      listAnalyticsEvents({}),
      listAnalyticsHeritage({}),
      listAnalyticsScenic({})
    ]);
    assert.equal(events.data[0].totalRegistrations, 2);
    assert.equal(events.data[0].confirmedAttendance, null);
    assert.equal(events.data[0].status, "upcoming");
    assert.equal(heritage.data[0].viewCount, null);
    assert.equal(heritage.data[0].isPublished, true);
    assert.equal(scenic.data[0].latitude, null);
    assert.equal(scenic.data[0].longitude, 121.4);
    assert.equal(scenic.data[0].isPublished, false);
  } finally {
    Event.findAndCountAll = originals.events;
    EventRegistration.findAll = originals.registrations;
    Heritage.findAndCountAll = originals.heritage;
    Scenic.findAndCountAll = originals.scenic;
  }
});
