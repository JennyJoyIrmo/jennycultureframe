import { Op } from "sequelize";
import { Order } from "../models/Order.js";
import { OrderItem } from "../models/Orderitem.js";
import { Product } from "../models/Product.js";
import { User } from "../models/userModel.js";
import { Event } from "../models/Event.js";
import { EventRegistration } from "../models/EventRegistration.js";
import { Heritage } from "../models/Heritage.js";
import { Scenic } from "../models/Scenic.js";
import { Payment } from "../models/Payment.js";

const MAX_PAGE_SIZE = 200;
const COMPLETED_SOURCE_STATUSES = new Set(["completed", "delivered"]);

export class AnalyticsIntegrationError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "AnalyticsIntegrationError";
    this.status = status;
    this.code = code;
  }
}

const fail = (condition, status, code, message) => {
  if (condition) throw new AnalyticsIntegrationError(status, code, message);
};

const plain = record => record?.get ? record.get({ plain: true }) : record;

function parsePositiveInteger(value, fallback, maximum) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value);
  fail(!/^\d+$/.test(normalized), 400, "INVALID_QUERY", "Pagination values must be positive integers.");
  const parsed = Number(normalized);
  fail(!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum, 400, "INVALID_QUERY", `Pagination value must be between 1 and ${maximum}.`);
  return parsed;
}

function parseDate(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = String(value);
  fail(!/^\d{4}-\d{2}-\d{2}$/.test(normalized), 400, "INVALID_DATE_RANGE", `${field} must use YYYY-MM-DD format.`);
  const date = new Date(`${normalized}T00:00:00.000Z`);
  fail(Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized, 400, "INVALID_DATE_RANGE", `${field} is not a valid calendar date.`);
  return date;
}

export function parseAnalyticsQuery(query = {}, { pagination = false } = {}) {
  const startDate = parseDate(query.startDate, "startDate");
  const endDate = parseDate(query.endDate, "endDate");
  fail(startDate && endDate && startDate > endDate, 400, "INVALID_DATE_RANGE", "startDate cannot be after endDate.");

  const parsed = { startDate, endDate };
  if (pagination) {
    parsed.page = parsePositiveInteger(query.page, 1, 1_000_000);
    parsed.limit = parsePositiveInteger(query.limit, 50, MAX_PAGE_SIZE);
  }
  return parsed;
}

function dateWhere(startDate, endDate) {
  const bounds = {};
  if (startDate) bounds[Op.gte] = startDate;
  if (endDate) {
    const exclusiveEnd = new Date(endDate);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
    bounds[Op.lt] = exclusiveEnd;
  }
  return Object.keys(bounds).length ? { createdAt: bounds } : {};
}

function fieldDateWhere(field, startDate, endDate) {
  const created = dateWhere(startDate, endDate).createdAt;
  return created ? { [field]: created } : {};
}

function paginationResult(page, limit, total) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit))
  };
}

function toCents(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function decimalFromCents(cents) {
  return (cents / 100).toFixed(2);
}

function sourceStatus(order) {
  return String(order?.status || "pending").trim().toLowerCase();
}

function paymentStatus(order) {
  return String(order?.payment_status || "unpaid").trim().toLowerCase();
}

export function normalizeAnalyticsOrderStatus(value) {
  const status = String(value || "pending").trim().toLowerCase();
  if (["delivered", "completed"].includes(status)) return "completed";
  if (["confirmed", "shipped", "processing"].includes(status)) return "processing";
  if (status === "cancelled") return "cancelled";
  return "pending";
}

function isQualifyingOrder(order) {
  return COMPLETED_SOURCE_STATUSES.has(sourceStatus(order)) || paymentStatus(order) === "paid";
}

function activeStatus(value) {
  return String(value || "active").toLowerCase() === "active";
}

function uniqueNumbers(values) {
  return [...new Set(values.map(Number).filter(Number.isInteger))];
}

function isoTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isoDate(value) {
  const timestamp = isoTimestamp(value);
  return timestamp ? timestamp.slice(0, 10) : null;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function getAnalyticsOverview(query = {}) {
  const { startDate, endDate } = parseAnalyticsQuery(query);
  const orderFilter = dateWhere(startDate, endDate);
  const registrationFilter = dateWhere(startDate, endDate);

  const [rawOrders, totalProducts, totalCustomers, totalEventRegistrations, totalHeritageSites, totalScenicDestinations] = await Promise.all([
    Order.findAll({
      where: orderFilter,
      attributes: ["id", "total_amount", "status", "payment_status"],
      raw: true
    }),
    Product.count({ where: { status: "active" } }),
    User.count({ where: { role: "customer" } }),
    EventRegistration.count({ where: registrationFilter }),
    Heritage.count({ where: { status: "active" } }),
    Scenic.count({ where: { status: "active" } })
  ]);

  const orders = rawOrders.map(plain);
  const qualifyingOrders = orders.filter(isQualifyingOrder);
  const totalRevenueCents = qualifyingOrders.reduce((sum, order) => sum + toCents(order.total_amount), 0);

  return {
    data: {
      totalRevenue: decimalFromCents(totalRevenueCents),
      totalOrders: orders.length,
      completedOrders: orders.filter(order => COMPLETED_SOURCE_STATUSES.has(sourceStatus(order))).length,
      totalProducts: Number(totalProducts),
      totalCustomers: Number(totalCustomers),
      totalEventRegistrations: Number(totalEventRegistrations),
      totalHeritageSites: Number(totalHeritageSites),
      totalScenicDestinations: Number(totalScenicDestinations)
    }
  };
}

export async function listAnalyticsOrders(query = {}) {
  const { startDate, endDate, page, limit } = parseAnalyticsQuery(query, { pagination: true });
  const result = await Order.findAndCountAll({
    where: dateWhere(startDate, endDate),
    order: [["createdAt", "DESC"], ["id", "DESC"]],
    limit,
    offset: (page - 1) * limit
  });
  const orders = result.rows.map(plain);
  const orderIds = uniqueNumbers(orders.map(order => order.id));

  const [rawItems, rawPayments] = orderIds.length ? await Promise.all([
    OrderItem.findAll({ where: { order_id: { [Op.in]: orderIds } }, raw: true }),
    Payment.findAll({ where: { order_id: { [Op.in]: orderIds } }, attributes: ["order_id", "refunded_amount"], raw: true })
  ]) : [[], []];
  const items = rawItems.map(plain);
  const productIds = uniqueNumbers(items.map(item => item.product_id));
  const products = productIds.length
    ? (await Product.findAll({ where: { id: { [Op.in]: productIds } }, attributes: ["id", "category"], raw: true })).map(plain)
    : [];
  const productById = new Map(products.map(product => [Number(product.id), product]));

  const itemsByOrder = new Map();
  for (const item of items) {
    const orderId = Number(item.order_id);
    if (!itemsByOrder.has(orderId)) itemsByOrder.set(orderId, []);
    itemsByOrder.get(orderId).push(item);
  }
  const refundsByOrder = new Map();
  for (const payment of rawPayments.map(plain)) {
    const orderId = Number(payment.order_id);
    refundsByOrder.set(orderId, (refundsByOrder.get(orderId) || 0) + toCents(payment.refunded_amount));
  }

  const data = orders.map(order => {
    const orderItems = itemsByOrder.get(Number(order.id)) || [];
    const serializedItems = orderItems.map(item => ({
      productId: String(item.product_id),
      productName: String(item.product_name || "Unknown Product").slice(0, 200),
      category: String(productById.get(Number(item.product_id))?.category || "Uncategorized").slice(0, 100),
      quantity: Number(item.quantity) || 0,
      unitPrice: decimalFromCents(toCents(item.price))
    }));
    const itemSubtotalCents = orderItems.reduce((sum, item) => sum + toCents(item.price) * (Number(item.quantity) || 0), 0);

    return {
      id: String(order.id),
      createdAt: isoTimestamp(order.createdAt),
      updatedAt: isoTimestamp(order.updatedAt),
      status: normalizeAnalyticsOrderStatus(order.status),
      currency: "PHP",
      items: serializedItems,
      subtotal: decimalFromCents(orderItems.length ? itemSubtotalCents : toCents(order.total_amount)),
      discountAmount: "0.00",
      shippingAmount: "0.00",
      taxAmount: "0.00",
      paymentStatus: paymentStatus(order),
      refundAmount: decimalFromCents(refundsByOrder.get(Number(order.id)) || 0)
    };
  });

  return { data, pagination: paginationResult(page, limit, Number(result.count)) };
}

export async function listAnalyticsProducts(query = {}) {
  const { page, limit } = parseAnalyticsQuery(query, { pagination: true });
  const result = await Product.findAndCountAll({
    order: [["name", "ASC"], ["id", "ASC"]],
    limit,
    offset: (page - 1) * limit
  });
  const products = result.rows.map(plain);
  const productIds = uniqueNumbers(products.map(product => product.id));
  let salesByProduct = new Map();

  if (productIds.length) {
    const candidateItems = (await OrderItem.findAll({ where: { product_id: { [Op.in]: productIds } }, raw: true })).map(plain);
    const candidateOrderIds = uniqueNumbers(candidateItems.map(item => item.order_id));
    const qualifyingOrders = candidateOrderIds.length
      ? (await Order.findAll({
          where: { id: { [Op.in]: candidateOrderIds } },
          attributes: ["id", "status", "payment_status"],
          raw: true
        })).map(plain).filter(isQualifyingOrder)
      : [];
    const qualifyingIds = new Set(qualifyingOrders.map(order => Number(order.id)));

    salesByProduct = new Map();
    for (const item of candidateItems) {
      if (!qualifyingIds.has(Number(item.order_id))) continue;
      const productId = Number(item.product_id);
      const current = salesByProduct.get(productId) || { unitsSold: 0, revenueCents: 0 };
      current.unitsSold += Number(item.quantity) || 0;
      current.revenueCents += toCents(item.price) * (Number(item.quantity) || 0);
      salesByProduct.set(productId, current);
    }
  }

  return {
    data: products.map(product => {
      const sales = salesByProduct.get(Number(product.id)) || { unitsSold: 0, revenueCents: 0 };
      return {
        id: String(product.id),
        name: String(product.name || "Unnamed Product").slice(0, 200),
        category: String(product.category || "Uncategorized").slice(0, 100),
        price: decimalFromCents(toCents(product.price)),
        stockQuantity: Number.isInteger(Number(product.stocks)) ? Number(product.stocks) : null,
        unitsSold: sales.unitsSold,
        totalRevenue: decimalFromCents(sales.revenueCents),
        isAvailable: activeStatus(product.status) && Number(product.stocks) > 0
      };
    }),
    pagination: paginationResult(page, limit, Number(result.count))
  };
}

export async function getAnalyticsCustomers(query = {}) {
  const { startDate, endDate } = parseAnalyticsQuery(query);
  const registrationWhere = { role: "customer", ...dateWhere(startDate, endDate) };
  const orderWhere = { user_id: { [Op.ne]: null }, ...dateWhere(startDate, endDate) };

  const [totalRegistered, registrations, rawOrders] = await Promise.all([
    User.count({ where: { role: "customer" } }),
    User.findAll({ where: registrationWhere, attributes: ["createdAt"], raw: true }),
    Order.findAll({ where: orderWhere, attributes: ["user_id", "status", "payment_status"], raw: true })
  ]);

  const orderCounts = new Map();
  for (const order of rawOrders.map(plain).filter(isQualifyingOrder)) {
    const userId = Number(order.user_id);
    if (Number.isInteger(userId)) orderCounts.set(userId, (orderCounts.get(userId) || 0) + 1);
  }
  const registrationsByDate = new Map();
  for (const user of registrations.map(plain)) {
    const date = isoDate(user.createdAt);
    if (date) registrationsByDate.set(date, (registrationsByDate.get(date) || 0) + 1);
  }

  return {
    data: {
      totalRegistered: Number(totalRegistered),
      newThisPeriod: registrations.length,
      withAtLeastOneOrder: orderCounts.size,
      repeatCustomers: [...orderCounts.values()].filter(count => count >= 2).length,
      registrationsByDate: [...registrationsByDate.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, count]) => ({ date, count }))
    }
  };
}

export async function listAnalyticsEvents(query = {}) {
  const { startDate, endDate, page, limit } = parseAnalyticsQuery(query, { pagination: true });
  const result = await Event.findAndCountAll({
    where: fieldDateWhere("event_date", startDate, endDate),
    order: [["event_date", "DESC"], ["id", "DESC"]],
    limit,
    offset: (page - 1) * limit
  });
  const events = result.rows.map(plain);
  const eventIds = uniqueNumbers(events.map(event => event.id));
  const registrations = eventIds.length
    ? (await EventRegistration.findAll({ where: { event_id: { [Op.in]: eventIds } }, attributes: ["event_id"], raw: true })).map(plain)
    : [];
  const registrationCount = new Map();
  for (const registration of registrations) {
    const eventId = Number(registration.event_id);
    registrationCount.set(eventId, (registrationCount.get(eventId) || 0) + 1);
  }
  const today = new Date().toISOString().slice(0, 10);

  return {
    data: events.map(event => {
      const eventDate = isoDate(event.event_date);
      return {
        id: String(event.id),
        name: String(event.title || "Unnamed Event").slice(0, 200),
        startDate: eventDate,
        endDate: eventDate,
        status: eventDate && eventDate >= today ? "upcoming" : "completed",
        totalRegistrations: registrationCount.get(Number(event.id)) || 0,
        confirmedAttendance: null,
        cancelledRegistrations: 0
      };
    }),
    pagination: paginationResult(page, limit, Number(result.count))
  };
}

export async function listAnalyticsHeritage(query = {}) {
  const { page, limit } = parseAnalyticsQuery(query, { pagination: true });
  const result = await Heritage.findAndCountAll({ order: [["title", "ASC"], ["id", "ASC"]], limit, offset: (page - 1) * limit });
  return {
    data: result.rows.map(plain).map(item => ({
      id: String(item.id),
      name: String(item.title || "Unnamed Site").slice(0, 200),
      category: String(item.category || "Uncategorized").slice(0, 100),
      location: item.location ? String(item.location).slice(0, 250) : null,
      viewCount: null,
      isPublished: activeStatus(item.status)
    })),
    pagination: paginationResult(page, limit, Number(result.count))
  };
}

export async function listAnalyticsScenic(query = {}) {
  const { page, limit } = parseAnalyticsQuery(query, { pagination: true });
  const result = await Scenic.findAndCountAll({ order: [["title", "ASC"], ["id", "ASC"]], limit, offset: (page - 1) * limit });
  return {
    data: result.rows.map(plain).map(item => ({
      id: String(item.id),
      name: String(item.title || "Unnamed Destination").slice(0, 200),
      category: "Scenic Destination",
      latitude: nullableNumber(item.latitude),
      longitude: nullableNumber(item.longitude),
      viewCount: null,
      isPublished: activeStatus(item.status)
    })),
    pagination: paginationResult(page, limit, Number(result.count))
  };
}
