import { User } from "../models/userModel.js";
import { Order } from "../models/Order.js";
import { Op } from "sequelize";

const customerMgmtController = {

  index: async (req, res) => {
    try {
      const { status, search } = req.query;
      const where = { role: "customer" };
      if (status && status !== "all") where.status = status;
      if (search) where[Op.or] = [
        { name:  { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
      const customers = await User.findAll({ where, attributes: { exclude: ["password"] }, order: [["createdAt","DESC"]] });
      const enriched = await Promise.all(customers.map(async (c) => {
        const orders = await Order.findAll({ where: { customer_email: c.email }, raw: true });
        const total  = orders.reduce((s, o) => s + Number(o.total_amount), 0);
        return { id: c.id, name: c.name, email: c.email, phone: c.phone, status: c.status, createdAt: c.createdAt, orderCount: orders.length, totalSpend: total.toFixed(2) };
      }));
      const counts = {
        all:      await User.count({ where: { role:"customer" } }),
        active:   await User.count({ where: { role:"customer", status:"active" } }),
        inactive: await User.count({ where: { role:"customer", status:"inactive" } })
      };
      res.render("admin/customer-list", { title:"Customer Management", activePage:"customers", customers: enriched, counts, filter: status||"all", search: search||"" });
    } catch (err) {
      console.error(err);
      res.status(500).send("Error loading customers");
    }
  },

  detail: async (req, res) => {
    try {
      const customer = await User.findOne({ where: { id: req.params.id, role:"customer" }, attributes: { exclude:["password"] } });
      if (!customer) return res.status(404).send("Not found");
      const orders = await Order.findAll({ where: { customer_email: customer.email }, order: [["createdAt","DESC"]] });
      const totalSpend = orders.reduce((s, o) => s + Number(o.total_amount), 0);
      res.render("admin/customer-detail", { title:`Customer: ${customer.name}`, activePage:"customers", customer, orders, totalSpend: totalSpend.toFixed(2) });
    } catch (err) { res.status(500).send("Error"); }
  },

  toggleStatus: async (req, res) => {
    try {
      const customer = await User.findOne({ where: { id: req.params.id, role:"customer" } });
      if (!customer) return res.status(404).send("Not found");
      await customer.update({ status: customer.status === "active" ? "inactive" : "active" });
      req.flash("success_msg", `Customer ${customer.name} status updated.`);
      res.redirect(`/admin/customers/${req.params.id}`);
    } catch (err) {
      req.flash("error_msg", "Failed.");
      res.redirect("/admin/customers");
    }
  }
};

export { customerMgmtController };
