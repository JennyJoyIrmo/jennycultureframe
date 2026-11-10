import fs from "fs";
import path from "path";
import { Op } from "sequelize";
import { Product } from "../models/Product.js";
import { ProductCategory } from "../models/ProductCategory.js";
import { OrderItem } from "../models/Orderitem.js";

const DEFAULT_CATEGORIES = [
  ["handicraft", "Locally made crafts and traditional artisan products"],
  ["food", "Local delicacies, ingredients, and packaged food"],
  ["souvenir", "Cultural keepsakes and visitor souvenirs"],
  ["other", "Other approved cultural products"]
];

const PRODUCT_STATUSES = ["active", "inactive", "pending"];

const ensureDefaultCategories = async () => {
  await Promise.all(DEFAULT_CATEGORIES.map(([name, description]) =>
    ProductCategory.findOrCreate({
      where: { name },
      defaults: { description, is_active: true }
    })
  ));
};

const productWhereForSeller = req => ({ seller_id: req.seller.id });

const removeLocalProductImage = publicUrl => {
  if (!publicUrl?.startsWith("/uploads/products/")) return;
  const filename = path.basename(publicUrl);
  const filePath = path.join(process.cwd(), "public", "uploads", "products", filename);
  fs.rm(filePath, { force: true }, () => {});
};

const discardRequestUpload = req => {
  if (req.file?.publicUrl) removeLocalProductImage(req.file.publicUrl);
};

const categoriesForForm = async selectedName => {
  await ensureDefaultCategories();
  const rows = await ProductCategory.findAll({
    where: { is_active: true },
    order: [["name", "ASC"]]
  });
  return rows.map(row => {
    const category = row.get({ plain: true });
    category.selected = category.name === selectedName;
    return category;
  });
};

const normalizeProductInput = body => ({
  name: String(body.name || "").trim(),
  description: String(body.description || "").trim(),
  category: String(body.category || "").trim(),
  price: Number(body.price),
  stocks: Number(body.stocks),
  status: PRODUCT_STATUSES.includes(body.status) ? body.status : "active",
  free_shipping: body.free_shipping === "on" || body.free_shipping === "true" || body.free_shipping === "1"
});

const validateProductInput = async input => {
  const errors = [];
  if (input.name.length < 2 || input.name.length > 200) {
    errors.push("Product name must contain 2 to 200 characters.");
  }
  if (input.description.length < 5 || input.description.length > 5000) {
    errors.push("Description must contain 5 to 5,000 characters.");
  }
  if (!Number.isFinite(input.price) || input.price <= 0 || input.price > 1000000) {
    errors.push("Price must be between PHP 0.01 and PHP 1,000,000.");
  }
  if (!Number.isInteger(input.stocks) || input.stocks < 0 || input.stocks > 1000000) {
    errors.push("Stock must be a whole number between 0 and 1,000,000.");
  }

  const category = input.category
    ? await ProductCategory.findOne({ where: { name: input.category, is_active: true } })
    : null;
  if (!category) errors.push("Select an active product category.");
  return errors;
};

const renderProductForm = async (res, options) => {
  const product = options.product || {};
  res.status(options.statusCode || 200).render("seller/product-form", {
    title: options.title,
    sellerPage: "products",
    product,
    categories: await categoriesForForm(product.category),
    formAction: options.formAction,
    submitLabel: options.submitLabel,
    errors: options.errors || []
  });
};

export const dashboardPage = async (req, res, next) => {
  try {
    const where = productWhereForSeller(req);
    const [total, active, outOfStock, lowStock, recentProducts] = await Promise.all([
      Product.count({ where }),
      Product.count({ where: { ...where, status: "active" } }),
      Product.count({ where: { ...where, stocks: 0 } }),
      Product.count({ where: { ...where, stocks: { [Op.between]: [1, 5] } } }),
      Product.findAll({ where, order: [["updatedAt", "DESC"]], limit: 6 })
    ]);

    res.render("seller/dashboard", {
      title: "Seller Dashboard",
      sellerPage: "dashboard",
      stats: { total, active, outOfStock, lowStock },
      recentProducts: recentProducts.map(product => product.get({ plain: true }))
    });
  } catch (error) {
    next(error);
  }
};

export const productsPage = async (req, res, next) => {
  try {
    const search = String(req.query.search || "").trim();
    const category = String(req.query.category || "").trim();
    const status = String(req.query.status || "").trim();
    const where = productWhereForSeller(req);

    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } }
      ];
    }
    if (category) where.category = category;
    if (PRODUCT_STATUSES.includes(status)) where.status = status;

    const products = await Product.findAll({ where, order: [["updatedAt", "DESC"]] });
    res.render("seller/products", {
      title: "My Products",
      sellerPage: "products",
      products: products.map(product => product.get({ plain: true })),
      categories: await categoriesForForm(category),
      filters: { search, category, status }
    });
  } catch (error) {
    next(error);
  }
};

export const addProductPage = async (_req, res, next) => {
  try {
    await renderProductForm(res, {
      title: "Add Product",
      formAction: "/seller/products/add",
      submitLabel: "Add product",
      product: { status: "active", stocks: 0 }
    });
  } catch (error) {
    next(error);
  }
};

export const addProduct = async (req, res, next) => {
  try {
    await ensureDefaultCategories();
    const input = normalizeProductInput(req.body);
    const errors = await validateProductInput(input);
    if (req.uploadError) errors.push(req.uploadError);

    if (errors.length) {
      discardRequestUpload(req);
      return renderProductForm(res, {
        statusCode: 422,
        title: "Add Product",
        formAction: "/seller/products/add",
        submitLabel: "Add product",
        product: { ...input },
        errors
      });
    }

    await Product.create({
      ...input,
      seller_id: req.seller.id,
      image_url: req.file?.publicUrl || null
    });
    req.flash("success_msg", `Product "${input.name}" was added.`);
    res.redirect("/seller/products");
  } catch (error) {
    discardRequestUpload(req);
    next(error);
  }
};

export const editProductPage = async (req, res, next) => {
  try {
    const product = await Product.findOne({
      where: { id: req.params.id, ...productWhereForSeller(req) }
    });
    if (!product) return res.status(404).render("error", { title: "Not Found", message: "Product not found." });

    await renderProductForm(res, {
      title: "Edit Product",
      formAction: `/seller/products/edit/${product.id}`,
      submitLabel: "Save changes",
      product: product.get({ plain: true })
    });
  } catch (error) {
    next(error);
  }
};

export const editProduct = async (req, res, next) => {
  try {
    const product = await Product.findOne({
      where: { id: req.params.id, ...productWhereForSeller(req) }
    });
    if (!product) {
      discardRequestUpload(req);
      return res.status(404).render("error", { title: "Not Found", message: "Product not found." });
    }

    await ensureDefaultCategories();
    const input = normalizeProductInput(req.body);
    const errors = await validateProductInput(input);
    if (req.uploadError) errors.push(req.uploadError);

    if (errors.length) {
      discardRequestUpload(req);
      return renderProductForm(res, {
        statusCode: 422,
        title: "Edit Product",
        formAction: `/seller/products/edit/${product.id}`,
        submitLabel: "Save changes",
        product: { ...product.get({ plain: true }), ...input },
        errors
      });
    }

    const oldImage = product.image_url;
    await product.update({
      ...input,
      image_url: req.file?.publicUrl || oldImage
    });
    if (req.file?.publicUrl && oldImage) removeLocalProductImage(oldImage);

    req.flash("success_msg", `Product "${input.name}" was updated.`);
    res.redirect("/seller/products");
  } catch (error) {
    discardRequestUpload(req);
    next(error);
  }
};

export const deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findOne({
      where: { id: req.params.id, ...productWhereForSeller(req) }
    });
    if (!product) {
      req.flash("error_msg", "Product not found.");
      return res.redirect("/seller/products");
    }

    const orderCount = await OrderItem.count({ where: { product_id: product.id } });
    if (orderCount > 0) {
      await product.update({ status: "inactive" });
      req.flash("error_msg", "This product has order history, so it was archived instead of deleted.");
      return res.redirect("/seller/products");
    }

    const image = product.image_url;
    await product.destroy();
    removeLocalProductImage(image);
    req.flash("success_msg", "Product deleted.");
    res.redirect("/seller/products");
  } catch (error) {
    next(error);
  }
};

export const categoriesPage = async (_req, res, next) => {
  try {
    await ensureDefaultCategories();
    const rows = await ProductCategory.findAll({ order: [["name", "ASC"]] });
    const categories = await Promise.all(rows.map(async row => ({
      ...row.get({ plain: true }),
      productCount: await Product.count({ where: { category: row.name } })
    })));
    res.render("seller/categories", {
      title: "Product Categories",
      sellerPage: "categories",
      categories
    });
  } catch (error) {
    next(error);
  }
};

export const addCategory = async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim().toLowerCase();
    const description = String(req.body.description || "").trim();
    if (name.length < 2 || name.length > 120) {
      req.flash("error_msg", "Category name must contain 2 to 120 characters.");
      return res.redirect("/seller/categories");
    }

    const [, created] = await ProductCategory.findOrCreate({
      where: { name },
      defaults: { description: description || null, is_active: true }
    });
    req.flash(created ? "success_msg" : "error_msg", created ? `Category "${name}" added.` : `Category "${name}" already exists.`);
    res.redirect("/seller/categories");
  } catch (error) {
    next(error);
  }
};

export const deleteCategory = async (req, res, next) => {
  try {
    const category = await ProductCategory.findByPk(req.params.id);
    if (!category) {
      req.flash("error_msg", "Category not found.");
      return res.redirect("/seller/categories");
    }

    const productCount = await Product.count({ where: { category: category.name } });
    if (productCount > 0) {
      req.flash("error_msg", `Category "${category.name}" is still used by ${productCount} product(s).`);
      return res.redirect("/seller/categories");
    }

    await category.destroy();
    req.flash("success_msg", `Category "${category.name}" deleted.`);
    res.redirect("/seller/categories");
  } catch (error) {
    next(error);
  }
};
