import { Seller } from "../models/Seller.js";

export const requireSeller = async (req, res, next) => {
  if (!req.session?.isAuthenticated) {
    return res.redirect("/login");
  }

  if (req.session.userRole !== "seller") {
    req.flash("error_msg", "Access denied. Seller access is required.");
    return res.redirect("/dashboard");
  }

  try {
    const seller = await Seller.findOne({
      where: {
        user_id: req.session.userId,
        status: "active"
      }
    });

    if (!seller) {
      return res.status(403).render("error", {
        title: "Seller Account Unavailable",
        message: "Your seller profile is pending or inactive. Contact a CultureFrame administrator."
      });
    }

    req.seller = seller;
    res.locals.seller = seller.get({ plain: true });
    next();
  } catch (error) {
    next(error);
  }
};
