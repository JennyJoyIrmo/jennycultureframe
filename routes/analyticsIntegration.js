import express from "express";
import { analyticsIntegrationController } from "../controllers/analyticsIntegrationController.js";
import {
  cultureMetricsRateLimiter,
  requireCultureMetricsToken
} from "../middleware/cultureMetricsAuth.js";

const router = express.Router();

router.use(requireCultureMetricsToken);
router.use(cultureMetricsRateLimiter);
router.get("/overview", analyticsIntegrationController.overview);
router.get("/orders", analyticsIntegrationController.orders);
router.get("/products", analyticsIntegrationController.products);
router.get("/customers/summary", analyticsIntegrationController.customers);
router.get("/events", analyticsIntegrationController.events);
router.get("/heritage", analyticsIntegrationController.heritage);
router.get("/scenic", analyticsIntegrationController.scenic);

router.use((error, _req, res, _next) => {
  const status = Number.isInteger(error.status) ? error.status : 500;
  const code = error.code || "ANALYTICS_INTEGRATION_ERROR";
  if (status >= 500) console.error("CultureMetrics integration error:", error);
  return res.status(status).json({
    success: false,
    error: {
      code: status >= 500 ? "ANALYTICS_INTEGRATION_ERROR" : code,
      message: status >= 500 ? "CultureMetrics analytics request failed." : error.message
    }
  });
});

export default router;
