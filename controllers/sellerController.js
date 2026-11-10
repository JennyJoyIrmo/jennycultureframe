import { Op } from "sequelize";
import { Seller } from "../models/Seller.js";
import { Product } from "../models/Product.js";
import { User } from "../models/userModel.js";
import { sequelize } from "../models/db.js";

const accountStatusForSeller = sellerStatus => sellerStatus === "inactive" ? "inactive" : "active";

const sellerController = {
  index: async (req, res) => {
    try {
      const { status, search } = req.query;
      const where = {};
      if (status && status !== "all") where.status = status;
      if (search) {
        const likeOperator = sequelize.getDialect() === "postgres" ? Op.iLike : Op.like;
        where[Op.or] = [
          { business_name: { [likeOperator]: `%${search}%` } },
          { email: { [likeOperator]: `%${search}%` } }
        ];
      }

      const sellers = await Seller.findAll({ where, order: [["createdAt", "DESC"]] });
      const counts = {
        all: await Seller.count(),
        active: await Seller.count({ where: { status: "active" } }),
        pending: await Seller.count({ where: { status: "pending" } }),
        inactive: await Seller.count({ where: { status: "inactive" } })
      };
      res.render("admin/seller-list", {
        title: "Seller Management",
        activePage: "sellers",
        sellers,
        counts,
        filter: status || "all",
        search: search || ""
      });
    } catch (error) {
      console.error(error);
      res.status(500).send("Error loading sellers");
    }
  },

  addForm: (_req, res) => res.render("admin/seller-add", {
    title: "Add Seller",
    activePage: "sellers"
  }),

  add: async (req, res) => {
    const {
      business_name, contact_name, email, phone, address, category,
      status, commission_rate, notes, temporary_password
    } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (String(temporary_password || "").length < 12) {
      req.flash("error_msg", "A temporary seller password of at least 12 characters is required.");
      return res.redirect("/admin/sellers/add");
    }

    try {
      await sequelize.transaction(async transaction => {
        const existingUser = await User.findOne({ where: { email: normalizedEmail }, transaction });
        if (existingUser) throw new Error("A login account already uses this email address.");

        const sellerUser = await User.create({
          name: String(contact_name || business_name || "Seller").trim(),
          email: normalizedEmail,
          password: temporary_password,
          role: "seller",
          status: accountStatusForSeller(status || "pending"),
          phone: phone || null,
          address: address || null
        }, { transaction });

        await Seller.create({
          user_id: sellerUser.id,
          business_name,
          contact_name,
          email: normalizedEmail,
          phone,
          address,
          category,
          status: status || "pending",
          commission_rate: parseFloat(commission_rate) || 10,
          notes
        }, { transaction });
      });

      req.flash("success_msg", `Seller "${business_name}" and its login account were added.`);
      res.redirect("/admin/sellers");
    } catch (error) {
      req.flash("error_msg", `Failed: ${error.message}`);
      res.redirect("/admin/sellers/add");
    }
  },

  editForm: async (req, res) => {
    try {
      const seller = await Seller.findByPk(req.params.id);
      if (!seller) return res.status(404).send("Not found");
      res.render("admin/seller-edit", {
        title: "Edit Seller",
        activePage: "sellers",
        seller,
        hasLoginAccount: Boolean(seller.user_id)
      });
    } catch (_error) {
      res.status(500).send("Error");
    }
  },

  update: async (req, res) => {
    const {
      business_name, contact_name, email, phone, address, category,
      status, commission_rate, notes, reset_password
    } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (reset_password && reset_password.length < 12) {
      req.flash("error_msg", "A new seller password must contain at least 12 characters.");
      return res.redirect(`/admin/sellers/edit/${req.params.id}`);
    }

    try {
      let accountCreated = false;
      await sequelize.transaction(async transaction => {
        const seller = await Seller.findByPk(req.params.id, { transaction });
        if (!seller) throw new Error("Seller not found.");

        let user = seller.user_id ? await User.findByPk(seller.user_id, { transaction }) : null;
        if (!user && reset_password) {
          const emailOwner = await User.findOne({ where: { email: normalizedEmail }, transaction });
          if (emailOwner) throw new Error("A login account already uses this email address.");
          user = await User.create({
            name: String(contact_name || business_name || "Seller").trim(),
            email: normalizedEmail,
            password: reset_password,
            role: "seller",
            status: accountStatusForSeller(status),
            phone: phone || null,
            address: address || null
          }, { transaction });
          seller.user_id = user.id;
          accountCreated = true;
        } else if (user) {
          const emailOwner = await User.findOne({
            where: { email: normalizedEmail, id: { [Op.ne]: user.id } },
            transaction
          });
          if (emailOwner) throw new Error("A login account already uses this email address.");

          user.name = String(contact_name || business_name || "Seller").trim();
          user.email = normalizedEmail;
          user.role = "seller";
          user.status = accountStatusForSeller(status);
          user.phone = phone || null;
          user.address = address || null;
          if (reset_password) user.password = reset_password;
          await user.save({ transaction });
        }

        await seller.update({
          user_id: seller.user_id,
          business_name,
          contact_name,
          email: normalizedEmail,
          phone,
          address,
          category,
          status,
          commission_rate: parseFloat(commission_rate) || 10,
          notes
        }, { transaction });
      });

      req.flash("success_msg", accountCreated ? "Seller updated and login account created." : "Seller updated.");
      res.redirect("/admin/sellers");
    } catch (error) {
      req.flash("error_msg", `Failed: ${error.message}`);
      res.redirect(`/admin/sellers/edit/${req.params.id}`);
    }
  },

  delete: async (req, res) => {
    try {
      await sequelize.transaction(async transaction => {
        const seller = await Seller.findByPk(req.params.id, { transaction });
        if (!seller) throw new Error("Seller not found.");

        const productCount = await Product.count({ where: { seller_id: seller.id }, transaction });
        if (productCount > 0) {
          throw new Error("This seller has products. Set the seller to inactive instead of deleting it.");
        }

        const userId = seller.user_id;
        await seller.destroy({ transaction });
        if (userId) await User.destroy({ where: { id: userId }, transaction });
      });
      req.flash("success_msg", "Seller and its login account were deleted.");
    } catch (error) {
      req.flash("error_msg", error.message || "Failed to delete seller.");
    }
    res.redirect("/admin/sellers");
  }
};

export { sellerController };
