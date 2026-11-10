import { applyPaymentEvent, listPaymentOrders } from "../services/paymentIntegrationService.js";

export const listOrdersForPaymentSystem = async (req, res, next) => {
  try {
    const page = await listPaymentOrders({
      updatedAfter: req.query.updatedAfter,
      cursor: req.query.cursor
    });
    res.json(page);
  } catch (error) {
    next(error);
  }
};

export const receivePaymentEvent = async (req, res, next) => {
  try {
    const result = await applyPaymentEvent({
      externalId: req.params.externalId,
      idempotencyKey: req.get("idempotency-key"),
      payload: req.body
    });
    res.status(result.replayed ? 200 : 202).json(result);
  } catch (error) {
    next(error);
  }
};
