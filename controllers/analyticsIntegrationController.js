import {
  getAnalyticsOverview,
  getAnalyticsCustomers,
  listAnalyticsOrders,
  listAnalyticsProducts,
  listAnalyticsEvents,
  listAnalyticsHeritage,
  listAnalyticsScenic
} from "../services/analyticsIntegrationService.js";

const handler = service => async (req, res, next) => {
  try {
    return res.json(await service(req.query));
  } catch (error) {
    return next(error);
  }
};

export const analyticsIntegrationController = {
  overview: handler(getAnalyticsOverview),
  orders: handler(listAnalyticsOrders),
  products: handler(listAnalyticsProducts),
  customers: handler(getAnalyticsCustomers),
  events: handler(listAnalyticsEvents),
  heritage: handler(listAnalyticsHeritage),
  scenic: handler(listAnalyticsScenic)
};
