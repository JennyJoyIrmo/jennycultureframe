import crypto from "crypto";
import { Op } from "sequelize";
import { sequelize } from "../models/db.js";
import { Order } from "../models/Order.js";
import { OrderItem } from "../models/Orderitem.js";
import { Product } from "../models/Product.js";
import { Seller } from "../models/Seller.js";
import { Payment } from "../models/Payment.js";
import { PaymentIntegrationEvent } from "../models/PaymentIntegrationEvent.js";

const PAGE_SIZE = 100;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class PaymentIntegrationError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const fail = (condition, status, message) => {
  if (condition) throw new PaymentIntegrationError(status, message);
};

const encodeCursor = row => Buffer.from(JSON.stringify({
  updatedAt: row.updatedAt.toISOString(),
  id: row.id
})).toString("base64url");

const decodeCursor = value => {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const updatedAt = new Date(decoded.updatedAt);
    const id = Number(decoded.id);
    fail(Number.isNaN(updatedAt.getTime()) || !Number.isInteger(id) || id < 1, 400, "Invalid synchronization cursor.");
    return { updatedAt, id };
  } catch (error) {
    if (error instanceof PaymentIntegrationError) throw error;
    throw new PaymentIntegrationError(400, "Invalid synchronization cursor.");
  }
};

const parseUpdatedAfter = value => {
  if (!value) return null;
  const date = new Date(value);
  fail(Number.isNaN(date.getTime()), 400, "updatedAfter must be a valid ISO-8601 timestamp.");
  return date;
};

const centsForItem = item => Math.round(Number(item.price) * Number(item.quantity) * 100);

const safeLabel = (value, fallback, maximum) => {
  const normalized = String(value || "").trim();
  return (normalized.length >= 2 ? normalized : fallback).slice(0, maximum);
};

const customerExternalId = order => {
  if (order.user_id) return `CF-CUSTOMER-${order.user_id}`;
  const fingerprint = crypto.createHash("sha256")
    .update(String(order.customer_email || "").trim().toLowerCase())
    .digest("hex")
    .slice(0, 20);
  return `CF-GUEST-${fingerprint}`;
};

const externalIdForItem = item => `CF-ORDER-${item.order_id}-ITEM-${item.id}`;

const serializeOrderItem = async item => {
  const [order, product] = await Promise.all([
    Order.findByPk(item.order_id),
    Product.findByPk(item.product_id)
  ]);
  if (!order || !product?.seller_id) return null;

  const seller = await Seller.findByPk(product.seller_id);
  if (!seller) return null;

  const customerEmail = String(order.customer_email || "").trim().toLowerCase();
  const sellerEmail = String(seller.email || "").trim().toLowerCase();
  const quantity = Number(item.quantity);
  const amountCents = centsForItem(item);
  if (!EMAIL_PATTERN.test(customerEmail) || !EMAIL_PATTERN.test(sellerEmail)) return null;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) return null;
  if (!Number.isInteger(amountCents) || amountCents < 1 || amountCents > 100000000) return null;

  return {
    externalId: externalIdForItem(item),
    product: safeLabel(item.product_name || product.name, "Cultural product", 200),
    quantity,
    amountCents,
    currency: "PHP",
    customer: {
      externalId: customerExternalId(order),
      name: safeLabel(order.customer_name, "CultureFrame customer", 100),
      email: customerEmail.slice(0, 190),
      phone: String(order.customer_phone || "").slice(0, 30),
      address: String(order.shipping_address || "").slice(0, 250)
    },
    seller: {
      externalId: `CF-SELLER-${seller.id}`,
      name: safeLabel(seller.business_name || seller.contact_name, "CultureFrame seller", 100),
      email: sellerEmail.slice(0, 190),
      craft: safeLabel(seller.category || product.category, "Cultural products", 100),
      location: String(seller.address || "Mansalay, Oriental Mindoro").trim().slice(0, 200)
    }
  };
};

export const listPaymentOrders = async ({ updatedAfter: rawUpdatedAfter, cursor: rawCursor }) => {
  const updatedAfter = parseUpdatedAfter(rawUpdatedAfter);
  const cursor = decodeCursor(rawCursor);
  const conditions = [];
  if (updatedAfter) conditions.push({ updatedAt: { [Op.gt]: updatedAfter } });
  if (cursor) {
    conditions.push({
      [Op.or]: [
        { updatedAt: { [Op.gt]: cursor.updatedAt } },
        { updatedAt: cursor.updatedAt, id: { [Op.gt]: cursor.id } }
      ]
    });
  }

  const rows = await OrderItem.findAll({
    where: conditions.length ? { [Op.and]: conditions } : {},
    order: [["updatedAt", "ASC"], ["id", "ASC"]],
    limit: PAGE_SIZE + 1
  });
  const hasMore = rows.length > PAGE_SIZE;
  const pageRows = rows.slice(0, PAGE_SIZE);
  const serialized = await Promise.all(pageRows.map(serializeOrderItem));
  const orders = serialized.filter(Boolean);

  return {
    orders,
    nextCursor: hasMore && pageRows.length ? encodeCursor(pageRows.at(-1)) : null,
    skipped: pageRows.length - orders.length
  };
};

const stableJson = value => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const parseExternalId = externalId => {
  const match = String(externalId || "").match(/^CF-ORDER-(\d+)-ITEM-(\d+)$/);
  fail(!match, 404, "Unknown CultureFrame order reference.");
  return { orderId: Number(match[1]), itemId: Number(match[2]) };
};

const validateEvent = payload => {
  fail(!payload || typeof payload !== "object" || Array.isArray(payload), 400, "A JSON event payload is required.");
  const amountCents = Number(payload.amountCents);
  fail(!Number.isInteger(amountCents) || amountCents < 1 || amountCents > 100000000, 400, "amountCents must be a positive integer.");

  if (payload.paymentReference) {
    const reference = String(payload.paymentReference).trim();
    const providerReference = String(payload.providerReference || "").trim();
    fail(reference.length < 3 || reference.length > 190, 400, "Invalid payment reference.");
    fail(payload.status !== "SUCCEEDED", 400, "Only verified payment events are accepted.");
    fail(providerReference.length < 3 || providerReference.length > 190, 400, "A verified provider reference is required.");
    return { type: "payment", reference, providerReference, status: payload.status, amountCents };
  }

  if (payload.refundReference) {
    const reference = String(payload.refundReference).trim();
    fail(reference.length < 3 || reference.length > 190, 400, "Invalid refund reference.");
    fail(payload.status !== "COMPLETED", 400, "Only completed refund events are accepted.");
    return { type: "refund", reference, providerReference: null, status: payload.status, amountCents };
  }

  throw new PaymentIntegrationError(400, "Unsupported payment integration event.");
};

const refreshOrderPaymentStatus = async (orderId, transaction) => {
  const items = await OrderItem.findAll({ where: { order_id: orderId }, transaction });
  const eligibleExternalIds = [];
  for (const item of items) {
    const product = await Product.findByPk(item.product_id, { transaction });
    if (product?.seller_id) eligibleExternalIds.push(externalIdForItem(item));
  }

  if (!eligibleExternalIds.length) return "unpaid";
  const payments = await Payment.findAll({
    where: { integration_external_id: { [Op.in]: eligibleExternalIds } },
    transaction
  });

  let paymentStatus = "unpaid";
  if (payments.length) {
    const statuses = payments.map(payment => payment.status);
    if (payments.length === eligibleExternalIds.length && statuses.every(status => status === "refunded")) {
      paymentStatus = "refunded";
    } else if (statuses.some(status => ["partially_refunded", "refunded"].includes(status))) {
      paymentStatus = "partially_refunded";
    } else if (payments.length === eligibleExternalIds.length && statuses.every(status => status === "paid")) {
      paymentStatus = "paid";
    } else {
      paymentStatus = "partial";
    }
  }

  await Order.update({ payment_status: paymentStatus }, { where: { id: orderId }, transaction });
  return paymentStatus;
};

export const applyPaymentEvent = async ({ externalId, idempotencyKey, payload }) => {
  fail(typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 100, 400, "A valid Idempotency-Key header is required.");
  const canonicalPayload = stableJson(payload);
  const parsedEvent = validateEvent(payload);
  const { orderId, itemId } = parseExternalId(externalId);

  const existing = await PaymentIntegrationEvent.findOne({ where: { idempotency_key: idempotencyKey } });
  if (existing) {
    fail(existing.external_id !== externalId || existing.payload !== canonicalPayload, 409, "Idempotency key was already used for a different event.");
    return { accepted: true, replayed: true, paymentStatus: null };
  }

  return sequelize.transaction(async transaction => {
    const item = await OrderItem.findByPk(itemId, { transaction });
    fail(!item || Number(item.order_id) !== orderId, 404, "CultureFrame order line was not found.");
    const order = await Order.findByPk(orderId, { transaction });
    fail(!order, 404, "CultureFrame order was not found.");
    const expectedCents = centsForItem(item);

    let payment = await Payment.findOne({ where: { integration_external_id: externalId }, transaction });
    if (parsedEvent.type === "payment") {
      fail(parsedEvent.amountCents !== expectedCents, 409, "Payment amount does not match the CultureFrame order line.");
      if (payment) {
        fail(payment.reference_number !== parsedEvent.reference || Math.round(Number(payment.amount) * 100) !== parsedEvent.amountCents, 409, "A different payment is already linked to this order line.");
      } else {
        payment = await Payment.create({
          order_id: order.id,
          integration_external_id: externalId,
          customer_name: order.customer_name,
          customer_email: order.customer_email,
          amount: (parsedEvent.amountCents / 100).toFixed(2),
          method: "cultureframe_payments",
          status: "paid",
          refunded_amount: 0,
          reference_number: parsedEvent.reference,
          notes: `Verified by CultureFrame Payments (${parsedEvent.providerReference}).`,
          paid_at: new Date()
        }, { transaction });
      }
    } else {
      fail(!payment, 409, "The original verified payment has not been received.");
      const currentRefundedCents = Math.round(Number(payment.refunded_amount || 0) * 100);
      const nextRefundedCents = currentRefundedCents + parsedEvent.amountCents;
      const paymentAmountCents = Math.round(Number(payment.amount) * 100);
      fail(nextRefundedCents > paymentAmountCents, 409, "Refunds exceed the verified payment amount.");
      await payment.update({
        refunded_amount: (nextRefundedCents / 100).toFixed(2),
        status: nextRefundedCents === paymentAmountCents ? "refunded" : "partially_refunded"
      }, { transaction });
    }

    await PaymentIntegrationEvent.create({
      idempotency_key: idempotencyKey,
      external_id: externalId,
      event_type: parsedEvent.type,
      reference: parsedEvent.reference,
      status: parsedEvent.status,
      amount_cents: parsedEvent.amountCents,
      provider_reference: parsedEvent.providerReference,
      payload: canonicalPayload,
      processed_at: new Date()
    }, { transaction });

    const paymentStatus = await refreshOrderPaymentStatus(orderId, transaction);
    return { accepted: true, replayed: false, paymentStatus };
  });
};
