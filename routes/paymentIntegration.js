import express from "express";
import { requirePaymentIntegrationToken } from "../middleware/integrationTokenAuth.js";
import {
  listOrdersForPaymentSystem,
  receivePaymentEvent
} from "../controllers/paymentIntegrationController.js";

const router = express.Router();

router.use(requirePaymentIntegrationToken);
router.get("/orders", listOrdersForPaymentSystem);
router.post("/orders/:externalId/payment-events", receivePaymentEvent);

router.use((error, _req, res, _next) => {
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error("Payment integration error:", error);
  res.status(status).json({
    error: status >= 500 ? "Payment integration request failed." : error.message
  });
});

export default router;
