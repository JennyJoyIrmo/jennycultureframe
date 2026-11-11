import "dotenv/config";
import { sequelize } from "../models/db.js";
import { User } from "../models/userModel.js";
import { Seller } from "../models/Seller.js";
import { ProductCategory } from "../models/ProductCategory.js";
import { Product } from "../models/Product.js";
import { Order } from "../models/Order.js";
import { OrderItem } from "../models/Orderitem.js";
import { Heritage } from "../models/Heritage.js";
import { Scenic } from "../models/Scenic.js";
import { Craft } from "../models/Craft.js";
import { Event } from "../models/Event.js";
import { EventRegistration } from "../models/EventRegistration.js";
import { Feedback } from "../models/Feedback.js";
import { Payment } from "../models/Payment.js";

const databaseUrl = process.env.DATABASE_URL || "";
const isLocalDatabase = databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");

if (process.env.NODE_ENV === "production" || !isLocalDatabase) {
  throw new Error("Integration demo data may only be seeded into a local, non-production database.");
}

await sequelize.authenticate();

try {
  let customer = await User.findOne({
    where: { email: "integration.customer@cultureframe.local" }
  });
  if (!customer) {
    customer = await User.create({
      name: "Integration Customer",
      email: "integration.customer@cultureframe.local",
      password: "LocalCustomer2026!",
      role: "customer",
      status: "active",
      phone: "09170000001",
      address: "Calapan City"
    });
  }

  let sellerUser = await User.findOne({
    where: { email: "integration.seller@cultureframe.local" }
  });
  if (!sellerUser) {
    sellerUser = await User.create({
      name: "Integration Seller",
      email: "integration.seller@cultureframe.local",
      password: "LocalSeller2026!",
      role: "seller",
      status: "active",
      phone: "09170000002",
      address: "Oriental Mindoro"
    });
  }

  let seller = await Seller.findOne({
    where: { email: "integration.seller@cultureframe.local" }
  });
  if (!seller) {
    seller = await Seller.create({
      user_id: sellerUser.id,
      business_name: "Integration Heritage Crafts",
      contact_name: "Integration Seller",
      email: "integration.seller@cultureframe.local",
      phone: "09170000002",
      address: "Oriental Mindoro",
      category: "Handicrafts",
      status: "active",
      commission_rate: 10
    });
  }

  const [category] = await ProductCategory.findOrCreate({
    where: { name: "Integration Handicrafts" },
    defaults: {
      description: "Local integration test category",
      is_active: true
    }
  });

  const [heritage] = await Heritage.findOrCreate({
    where: { title: "Integration Heritage Site" },
    defaults: {
      description: "A local record used to verify the unified CultureFrame setup.",
      category: "landmark",
      location: "Oriental Mindoro",
      historical_significance: "Integration acceptance testing",
      year_established: "2026",
      status: "active"
    }
  });

  const [scenic] = await Scenic.findOrCreate({
    where: { title: "Integration Scenic View" },
    defaults: {
      description: "A local scenic integration record.",
      location: "Oriental Mindoro",
      latitude: 13.0,
      longitude: 121.0,
      status: "active"
    }
  });

  const [craft] = await Craft.findOrCreate({
    where: { title: "Integration Woven Craft" },
    defaults: {
      description: "A local craft integration record.",
      location: "Oriental Mindoro",
      latitude: 13.1,
      longitude: 121.1,
      status: "active"
    }
  });

  let product = await Product.findOne({
    where: { name: "Integration Woven Basket", seller_id: seller.id }
  });
  if (!product) {
    product = await Product.create({
      seller_id: seller.id,
      name: "Integration Woven Basket",
      description: "Local product used for integration acceptance testing.",
      price: 450,
      category: category.name,
      stocks: 20,
      status: "active",
      is_featured: true,
      heritage_id: heritage.id,
      free_shipping: false
    });
  }

  let order = await Order.findOne({
    where: { customer_email: customer.email }
  });
  if (!order) {
    order = await Order.create({
      user_id: customer.id,
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone: "09170000001",
      shipping_address: "Calapan City",
      total_amount: 900,
      status: "delivered",
      payment_status: "paid",
      payment_method: "gcash"
    });
  }

  const [orderItem] = await OrderItem.findOrCreate({
    where: { order_id: order.id, product_id: product.id },
    defaults: {
      product_name: product.name,
      quantity: 2,
      price: 450
    }
  });

  const [event] = await Event.findOrCreate({
    where: { title: "Integration Culture Workshop" },
    defaults: {
      description: "A local event used for integration acceptance testing.",
      event_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      location: "Calapan City",
      category: "workshop"
    }
  });

  await EventRegistration.findOrCreate({
    where: { event_id: event.id, email: customer.email },
    defaults: {
      user_id: customer.id,
      name: customer.name,
      phone: "09170000001"
    }
  });

  await Feedback.findOrCreate({
    where: { order_id: order.id, user_email: customer.email },
    defaults: {
      rating: 5,
      comment: "Integration feedback record."
    }
  });

  const [payment] = await Payment.findOrCreate({
    where: { integration_external_id: "local-integration-payment-1" },
    defaults: {
      order_id: order.id,
      customer_name: customer.name,
      customer_email: customer.email,
      amount: 900,
      method: "gcash",
      status: "paid",
      reference_number: "LOCAL-INTEGRATION-001",
      notes: "Local acceptance test payment",
      paid_at: new Date()
    }
  });

  console.log(JSON.stringify({
    customerId: customer.id,
    sellerId: seller.id,
    productId: product.id,
    orderId: order.id,
    orderItemId: orderItem.id,
    heritageId: heritage.id,
    scenicId: scenic.id,
    craftId: craft.id,
    eventId: event.id,
    paymentId: payment.id
  }));
} finally {
  await sequelize.close();
}
