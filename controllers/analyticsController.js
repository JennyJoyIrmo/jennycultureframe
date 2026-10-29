import { Order } from "../models/Order.js";
import { OrderItem } from "../models/Orderitem.js";
import { Product } from "../models/Product.js";
import { Feedback } from "../models/Feedback.js";
import { Op, fn, col, literal } from "sequelize";

const getRange = (q) => {
  const now   = new Date();
  const start = q.start ? new Date(q.start) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = q.end   ? new Date(q.end)   : now;
  end.setHours(23,59,59,999);
  return { start, end };
};

const analyticsController = {

  // GET /admin/analytics/sales
  sales: async (req, res) => {
    try {
      const { start, end } = getRange(req.query);
      const orders = await Order.findAll({ where: { createdAt: { [Op.between]: [start, end] } }, order: [["createdAt","DESC"]] });

      const totalRevenue = orders.reduce((s,o) => s + Number(o.total_amount), 0);
      const totalOrders  = orders.length;
      const avgOrder     = totalOrders ? (totalRevenue / totalOrders) : 0;

      const byMethod = {};
      const byStatus = {};
      const dailyMap = {};
      orders.forEach(o => {
        byMethod[o.payment_method||"unknown"] = (byMethod[o.payment_method||"unknown"]||0) + Number(o.total_amount);
        byStatus[o.status||"unknown"]         = (byStatus[o.status||"unknown"]||0) + 1;
        const day = new Date(o.createdAt).toISOString().split("T")[0];
        dailyMap[day] = (dailyMap[day]||0) + Number(o.total_amount);
      });
      const dailyLabels  = Object.keys(dailyMap).sort();
      const dailyRevenue = dailyLabels.map(d => dailyMap[d]);

      const orderIds = orders.map(o => o.id);
      let topProducts = [];
      if (orderIds.length) {
        topProducts = await OrderItem.findAll({
          where: { order_id: { [Op.in]: orderIds } },
          attributes: ["product_id","product_name",[fn("SUM",col("quantity")),"total_qty"],[fn("SUM",literal("quantity * price")),"total_rev"]],
          group: ["product_id","product_name"],
          order: [[literal("total_qty"),"DESC"]],
          limit: 5, raw: true
        });
      }

      res.render("admin/analytics-sales", {
        title:"Sales Analytics", activePage:"analytics",
        dateStart: start.toISOString().split("T")[0],
        dateEnd:   end.toISOString().split("T")[0],
        totalRevenue: totalRevenue.toFixed(2), totalOrders, avgOrder: avgOrder.toFixed(2),
        byMethod:     JSON.stringify(byMethod),
        byStatus:     JSON.stringify(byStatus),
        dailyLabels:  JSON.stringify(dailyLabels),
        dailyRevenue: JSON.stringify(dailyRevenue),
        topProducts, orders
      });
    } catch (err) { console.error(err); res.status(500).send("Error"); }
  },

  // GET /admin/analytics/business
  business: async (req, res) => {
    try {
      const { start, end } = getRange(req.query);
      const allOrders = await Order.findAll({ where: { createdAt: { [Op.between]: [start, end] } }, raw: true });

      const totalRevenue    = allOrders.reduce((s,o) => s + Number(o.total_amount), 0);
      const totalOrders     = allOrders.length;
      const deliveredOrders = allOrders.filter(o => o.status === "delivered").length;
      const pendingOrders   = allOrders.filter(o => o.status === "pending").length;
      const conversionRate  = totalOrders ? ((deliveredOrders/totalOrders)*100).toFixed(1) : "0.0";
      const avgOrderValue   = totalOrders ? (totalRevenue/totalOrders).toFixed(2) : "0.00";

      const monthlyMap = {};
      allOrders.forEach(o => {
        const m = new Date(o.createdAt).toISOString().substring(0,7);
        monthlyMap[m] = (monthlyMap[m]||0) + Number(o.total_amount);
      });
      const monthlyLabels  = Object.keys(monthlyMap).sort();
      const monthlyRevenue = monthlyLabels.map(m => monthlyMap[m]);

      const orderIds = allOrders.map(o => o.id);
      const categoryData = {};
      if (orderIds.length) {
        const items = await OrderItem.findAll({ where: { order_id: { [Op.in]: orderIds } }, attributes:["product_id","quantity","price"], raw:true });
        for (const item of items) {
          const prod = await Product.findByPk(item.product_id, { attributes:["category"], raw:true });
          if (prod) {
            const cat = prod.category || "other";
            categoryData[cat] = (categoryData[cat]||0) + Number(item.quantity) * Number(item.price);
          }
        }
      }

      let avgRating = "0.0", totalReviews = 0;
      try {
        const feedbacks = await Feedback.findAll({ raw:true });
        totalReviews = feedbacks.length;
        avgRating = totalReviews ? (feedbacks.reduce((s,f) => s + Number(f.rating), 0) / totalReviews).toFixed(1) : "0.0";
      } catch(_) {}

      res.render("admin/analytics-business", {
        title:"Business Analytics", activePage:"analytics",
        dateStart: start.toISOString().split("T")[0],
        dateEnd:   end.toISOString().split("T")[0],
        totalRevenue: totalRevenue.toFixed(2), totalOrders, deliveredOrders, pendingOrders,
        conversionRate, avgOrderValue, avgRating, totalReviews,
        monthlyLabels:  JSON.stringify(monthlyLabels),
        monthlyRevenue: JSON.stringify(monthlyRevenue),
        categoryData:   JSON.stringify(categoryData)
      });
    } catch (err) { console.error(err); res.status(500).send("Error"); }
  }
};

export { analyticsController };
