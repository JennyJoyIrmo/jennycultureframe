import crypto from "crypto";

const digest = value => crypto.createHash("sha256").update(value).digest();

const errorResponse = (res, status, code, message) => res.status(status).json({
  success: false,
  error: { code, message }
});

export const requireCultureMetricsToken = (req, res, next) => {
  const configuredToken = process.env.CULTUREMETRICS_INTEGRATION_TOKEN || "";
  if (configuredToken.length < 32) {
    return errorResponse(res, 503, "INTEGRATION_NOT_CONFIGURED", "CultureMetrics integration is not configured.");
  }

  const authorization = req.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return errorResponse(res, 401, "UNAUTHORIZED", "A bearer integration token is required.");

  if (!crypto.timingSafeEqual(digest(match[1]), digest(configuredToken))) {
    return errorResponse(res, 401, "UNAUTHORIZED", "Invalid integration credentials.");
  }

  return next();
};

export function createCultureMetricsRateLimiter({ limit = 120, windowMs = 60_000 } = {}) {
  let windowStartedAt = Date.now();
  let requestCount = 0;

  return (_req, res, next) => {
    const now = Date.now();
    if (now - windowStartedAt >= windowMs) {
      windowStartedAt = now;
      requestCount = 0;
    }

    requestCount += 1;
    const remaining = Math.max(0, limit - requestCount);
    const resetSeconds = Math.max(1, Math.ceil((windowStartedAt + windowMs - now) / 1000));
    res.set("RateLimit-Limit", String(limit));
    res.set("RateLimit-Remaining", String(remaining));
    res.set("RateLimit-Reset", String(resetSeconds));

    if (requestCount > limit) {
      res.set("Retry-After", String(resetSeconds));
      return errorResponse(res, 429, "RATE_LIMITED", "CultureMetrics integration rate limit reached.");
    }

    return next();
  };
}

export const cultureMetricsRateLimiter = createCultureMetricsRateLimiter({});
