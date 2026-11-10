import { Payment } from "../models/Payment.js";
import { Order } from "../models/Order.js";
import { Op } from "sequelize";

const paymentController = {

  index: async (req, res) => {
    try {
      await Payment.sync();
      const { status, method, search } = req.query;
      const where = {};
      if (status && status !== "all") where.status = status;
      if (method && method !== "all")  where.method = method;
      if (search) where[Op.or] = [
        { customer_name:    { [Op.iLike]: `%${search}%` } },
        { customer_email:   { [Op.iLike]: `%${search}%` } },
        { reference_number: { [Op.iLike]: `%${search}%` } }
      ];
      const payments    = await Payment.findAll({ where, order: [["createdAt","DESC"]] });
      const all         = await Payment.findAll({ raw: true });
      const totalPaid     = all.filter(p => p.status==="paid").reduce((s,p) => s+Number(p.amount), 0);
      const totalPending  = all.filter(p => p.status==="pending").reduce((s,p) => s+Number(p.amount), 0);
      const totalRefunded = all.reduce((sum, payment) => sum + Number(payment.refunded_amount || 0), 0);
      const counts = { all: all.length, paid: all.filter(p=>p.status==="paid").length, pending: all.filter(p=>p.status==="pending").length, failed: all.filter(p=>p.status==="failed").length, partially_refunded: all.filter(p=>p.status==="partially_refunded").length, refunded: all.filter(p=>p.status==="refunded").length };
      res.render("admin/payment-list", { title:"Payment Management", activePage:"payments", payments, counts, totalPaid: totalPaid.toFixed(2), totalPending: totalPending.toFixed(2), totalRefunded: totalRefunded.toFixed(2), filter: status||"all", filterMethod: method||"all", search: search||"" });
    } catch (err) { console.error(err); res.status(500).send("Error"); }
  },

  detail: async (req, res) => {
    try {
      await Payment.sync();
      const payment = await Payment.findByPk(req.params.id);
      if (!payment) return res.status(404).send("Not found");
      const order = await Order.findByPk(payment.order_id);
      res.render("admin/payment-detail", { title:`Payment #${payment.id}`, activePage:"payments", payment, order });
    } catch (err) { res.status(500).send("Error"); }
  },

  addForm: async (req, res) => {
    try {
      const orders = await Order.findAll({ order: [["createdAt","DESC"]], limit: 100 });
      res.render("admin/payment-add", { title:"Record Payment", activePage:"payments", orders });
    } catch (err) { res.status(500).send("Error"); }
  },

  add: async (req, res) => {
    try {
      await Payment.sync();
      const { order_id, customer_name, customer_email, amount, method, status, reference_number, notes } = req.body;
      await Payment.create({ order_id: parseInt(order_id), customer_name, customer_email, amount: parseFloat(amount), method, status: status||"pending", reference_number: reference_number||null, notes: notes||null, paid_at: status==="paid" ? new Date() : null });
      req.flash("success_msg", "Payment recorded.");
      res.redirect("/admin/payments");
    } catch (err) {
      req.flash("error_msg", "Failed: " + err.message);
      res.redirect("/admin/payments/add");
    }
  },

  updateStatus: async (req, res) => {
    try {
      await Payment.sync();
      const payment = await Payment.findByPk(req.params.id);
      if (!payment) return res.status(404).send("Not found");
      if (payment.integration_external_id) {
        req.flash("error_msg", "Integrated payments can only be changed by the CultureFrame Payments service.");
        return res.redirect(`/admin/payments/${req.params.id}`);
      }
      const { status, notes } = req.body;
      await payment.update({ status, notes: notes||payment.notes, paid_at: status==="paid" && !payment.paid_at ? new Date() : payment.paid_at });
      req.flash("success_msg", `Payment updated to ${status}.`);
      res.redirect(`/admin/payments/${req.params.id}`);
    } catch (err) {
      req.flash("error_msg", "Failed.");
      res.redirect("/admin/payments");
    }
  }
};

export { paymentController };
