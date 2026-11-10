const MODULE_DEFINITIONS = [
  { segment: "heritage", label: "Cultural Heritage", icon: "fa-landmark", description: "Stories, knowledge, and identity documented by the community." },
  { segment: "historical-sites", label: "Historical Sites", icon: "fa-building-columns", description: "Places that preserve a visible record of Mansalay's past." },
  { segment: "traditions", label: "Traditions", icon: "fa-hands", description: "Practices and knowledge carried across generations." },
  { segment: "events", label: "Cultural Events", icon: "fa-calendar-days", description: "Community gatherings, programs, and cultural activities." },
  { segment: "attractions", label: "Attractions", icon: "fa-map-location-dot", description: "Landscapes and destinations to explore responsibly." },
  { segment: "festivals", label: "Festivals", icon: "fa-masks-theater", description: "Celebrations rooted in local history and identity." },
  { segment: "local-products", label: "Local Products", icon: "fa-basket-shopping", description: "Local craft and livelihood presented with cultural context." }
];

const MODULE_BY_SEGMENT = new Map(MODULE_DEFINITIONS.map(module => [module.segment, module]));
const SEGMENT_BY_KIND = new Map([
  ["HERITAGE", "heritage"],
  ["HISTORICAL_SITE", "historical-sites"],
  ["TRADITION", "traditions"],
  ["EVENT", "events"],
  ["ATTRACTION", "attractions"],
  ["FESTIVAL", "festivals"],
  ["LOCAL_PRODUCT", "local-products"]
]);

const MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 8000;

export class VisitorInformationError extends Error {
  constructor(message, { code = "VISITOR_INFORMATION_ERROR", statusCode = 502, cause } = {}) {
    super(message, { cause });
    this.name = "VisitorInformationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export const visitorModules = Object.freeze(MODULE_DEFINITIONS.map(module => Object.freeze({ ...module })));

function cleanText(value, maxLength = 20000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function positiveInteger(value, fallback = 1, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function isLocalHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function resolveVisitorInformationUrl(rawUrl = process.env.VISITOR_INFORMATION_URL) {
  if (!rawUrl?.trim()) {
    throw new VisitorInformationError("The Visitor Information service is not configured.", {
      code: "NOT_CONFIGURED",
      statusCode: 503
    });
  }

  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch (error) {
    throw new VisitorInformationError("VISITOR_INFORMATION_URL is not a valid URL.", {
      code: "INVALID_CONFIGURATION",
      statusCode: 503,
      cause: error
    });
  }

  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new VisitorInformationError("VISITOR_INFORMATION_URL must be an HTTP(S) URL without embedded credentials.", {
      code: "INVALID_CONFIGURATION",
      statusCode: 503
    });
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:" && !isLocalHostname(url.hostname)) {
    throw new VisitorInformationError("Visitor Information must use HTTPS in production.", {
      code: "INSECURE_CONFIGURATION",
      statusCode: 503
    });
  }

  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  url.search = "";
  url.hash = "";
  return url;
}

function requireModule(segment) {
  const module = MODULE_BY_SEGMENT.get(segment);
  if (!module) {
    throw new VisitorInformationError("Unknown Visitor Information category.", {
      code: "UNKNOWN_MODULE",
      statusCode: 404
    });
  }
  return module;
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  return Object.fromEntries(
    Object.entries(payload)
      .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
      .slice(0, 30)
      .map(([key, value]) => [cleanText(key, 80), typeof value === "string" ? cleanText(value, 2000) : value])
  );
}

function normalizeItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const kind = cleanText(item.kind, 40).toUpperCase();
  const segment = SEGMENT_BY_KIND.get(kind);
  const slug = cleanText(item.slug, 200);
  const title = cleanText(item.title, 180);
  if (!segment || !title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;

  const payload = normalizePayload(item.payload);
  return {
    id: cleanText(item.id, 100),
    kind,
    segment,
    categoryLabel: MODULE_BY_SEGMENT.get(segment).label,
    title,
    slug,
    summary: cleanText(item.summary, 500),
    description: cleanText(item.description),
    culturalSignificance: cleanText(item.culturalSignificance, 10000),
    historicalBackground: cleanText(item.historicalBackground, 10000),
    location: cleanText(payload.location, 500),
    eventDate: cleanText(payload.eventDate || payload.startDate || payload.date, 100),
    featured: item.featured === true,
    url: `/discover/${segment}/${encodeURIComponent(slug)}`
  };
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map(normalizeItem).filter(Boolean).slice(0, 30);
}

async function requestJson(pathname, query = {}, options = {}) {
  const baseUrl = resolveVisitorInformationUrl(options.baseUrl);
  const apiBase = new URL(baseUrl.toString());
  apiBase.pathname = `${apiBase.pathname.replace(/\/$/, "")}/api/`;
  const url = new URL(pathname.replace(/^\//, ""), apiBase);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    clearTimeout(timeout);
    throw new VisitorInformationError("This Node.js version does not provide fetch().", {
      code: "FETCH_UNAVAILABLE",
      statusCode: 503
    });
  }

  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: controller.signal
    });
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    throw new VisitorInformationError(
      timedOut ? "The Visitor Information service took too long to respond." : "The Visitor Information service is currently unavailable.",
      { code: timedOut ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE", statusCode: 503, cause: error }
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new VisitorInformationError(
      response.status === 404 ? "This published Visitor Information record could not be found." : "The Visitor Information service returned an error.",
      { code: response.status === 404 ? "UPSTREAM_NOT_FOUND" : "UPSTREAM_ERROR", statusCode: response.status === 404 ? 404 : 502 }
    );
  }

  const contentType = response.headers.get("content-type") || "";
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (!contentType.toLowerCase().includes("application/json") || contentLength > MAX_RESPONSE_BYTES) {
    throw new VisitorInformationError("The Visitor Information service returned an invalid response.", { code: "INVALID_RESPONSE" });
  }

  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
    throw new VisitorInformationError("The Visitor Information response was too large.", { code: "INVALID_RESPONSE" });
  }

  try {
    return { data: JSON.parse(body), portalUrl: baseUrl.origin };
  } catch (error) {
    throw new VisitorInformationError("The Visitor Information service returned invalid JSON.", {
      code: "INVALID_RESPONSE",
      cause: error
    });
  }
}

function normalizeList(data) {
  return {
    items: normalizeItems(data?.items),
    total: Math.max(0, Number(data?.total) || 0),
    page: positiveInteger(data?.page),
    pages: positiveInteger(data?.pages)
  };
}

export const visitorInformationClient = {
  async getHome(options = {}) {
    const { data, portalUrl } = await requestJson("home", {}, options);
    const content = data?.content && typeof data.content === "object" && !Array.isArray(data.content) ? data.content : {};
    return {
      portalUrl,
      content: {
        heroTitle: cleanText(content.heroTitle, 180) || "Discover the Living Heritage of Mansalay",
        heroDescription: cleanText(content.heroDescription, 500) || "Explore published community stories, traditions, events, and places.",
        about: cleanText(content.about, 1000)
      },
      featured: normalizeItems(data?.featured),
      upcoming: normalizeItems(data?.upcoming)
    };
  },

  async getList(segment, { q = "", page = 1, limit = 12, ...options } = {}) {
    requireModule(segment);
    const { data, portalUrl } = await requestJson(segment, {
      q: cleanText(q, 100),
      page: positiveInteger(page),
      limit: positiveInteger(limit, 12, 30)
    }, options);
    return { ...normalizeList(data), portalUrl };
  },

  async search({ q = "", category = "", page = 1, limit = 12, ...options } = {}) {
    if (category) requireModule(category);
    const { data, portalUrl } = await requestJson("search", {
      q: cleanText(q, 100),
      category,
      page: positiveInteger(page),
      limit: positiveInteger(limit, 12, 30)
    }, options);
    return { ...normalizeList(data), portalUrl };
  },

  async getDetail(segment, slug, options = {}) {
    requireModule(segment);
    const safeSlug = cleanText(slug, 200);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(safeSlug)) {
      throw new VisitorInformationError("Invalid Visitor Information record.", { code: "INVALID_SLUG", statusCode: 404 });
    }
    const { data, portalUrl } = await requestJson(`${segment}/${encodeURIComponent(safeSlug)}`, {}, options);
    const item = normalizeItem(data?.item);
    if (!item || item.segment !== segment) {
      throw new VisitorInformationError("This published Visitor Information record could not be found.", {
        code: "UPSTREAM_NOT_FOUND",
        statusCode: 404
      });
    }
    return { item, portalUrl };
  }
};
