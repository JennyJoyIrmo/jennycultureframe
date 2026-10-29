import { Seller } from "../models/Seller.js";
import { Op } from "sequelize";

const sellerController = {

  index: async (req, res) => {
    try {
      await Seller.sync();
      const { status, search } = req.query;
      const where = {};
      if (status && status !== "all") where.status = status;
      if (search) where[Op.or] = [
        { business_name: { [Op.iLike]: `%${search}%` } },
        { email:         { [Op.iLike]: `%${search}%` } }
      ];
      const sellers = await Seller.findAll({ where, order: [["createdAt","DESC"]] });
      const counts = {
        all:      await Seller.count(),
        active:   await Seller.count({ where: { status: "active" } }),
        pending:  await Seller.count({ where: { status: "pending" } }),
        inactive: await Seller.count({ where: { status: "inactive" } })
      };
      res.render("admin/seller-list", { title:"Seller Management", activePage:"sellers", sellers, counts, filter: status||"all", search: search||"" });
    } catch (err) {
      console.error(err);
      res.status(500).send("Error loading sellers");
    }
  },

  addForm: (req, res) => res.render("admin/seller-add", { title:"Add Seller", activePage:"sellers" }),

  add: async (req, res) => {
    try {
      await Seller.sync();
      const { business_name, contact_name, email, phone, address, category, status, commission_rate, notes } = req.body;
      await Seller.create({ business_name, contact_name, email, phone, address, category, status: status||"pending", commission_rate: parseFloat(commission_rate)||10, notes });
      req.flash("success_msg", `Seller "${business_name}" added.`);
      res.redirect("/admin/sellers");
    } catch (err) {
      req.flash("error_msg", "Failed: " + err.message);
      res.redirect("/admin/sellers/add");
    }
  },

  editForm: async (req, res) => {
    try {
      await Seller.sync();
      const seller = await Seller.findByPk(req.params.id);
      if (!seller) return res.status(404).send("Not found");
      res.render("admin/seller-edit", { title:"Edit Seller", activePage:"sellers", seller });
    } catch (err) { res.status(500).send("Error"); }
  },

  update: async (req, res) => {
    try {
      const { business_name, contact_name, email, phone, address, category, status, commission_rate, notes } = req.body;
      await Seller.update({ business_name, contact_name, email, phone, address, category, status, commission_rate: parseFloat(commission_rate)||10, notes }, { where: { id: req.params.id } });
      req.flash("success_msg", "Seller updated.");
      res.redirect("/admin/sellers");
    } catch (err) {
      req.flash("error_msg", "Failed: " + err.message);
      res.redirect(`/admin/sellers/edit/${req.params.id}`);
    }
  },

  delete: async (req, res) => {
    try {
      await Seller.destroy({ where: { id: req.params.id } });
      req.flash("success_msg", "Seller deleted.");
      res.redirect("/admin/sellers");
    } catch (err) {
      req.flash("error_msg", "Failed to delete.");
      res.redirect("/admin/sellers");
    }
  }
};

export { sellerController };
