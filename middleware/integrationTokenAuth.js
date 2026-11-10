import crypto from "crypto";

const digest = value => crypto.createHash("sha256").update(value).digest();

export const requirePaymentIntegrationToken = (req, res, next) => {
  const configuredToken = process.env.PAYMENT_INTEGRATION_TOKEN || "";
  if (configuredToken.length < 32) {
    return res.status(503).json({ error: "Payment integration is not configured." });
  }

  const authorization = req.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: "Bearer authorization is required." });

  const supplied = digest(match[1]);
  const expected = digest(configuredToken);
  if (!crypto.timingSafeEqual(supplied, expected)) {
    return res.status(401).json({ error: "Invalid integration credentials." });
  }

  next();
};
