import {
  VisitorInformationError,
  visitorInformationClient,
  visitorModules
} from "../services/visitorInformationClient.js";

function pageNumber(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function modulesForSelect(selected = "") {
  return visitorModules.map(module => ({ ...module, selected: module.segment === selected }));
}

function pagination(result) {
  return {
    hasPrevious: result.page > 1,
    previousPage: Math.max(1, result.page - 1),
    hasNext: result.page < result.pages,
    nextPage: Math.min(result.pages, result.page + 1)
  };
}

function renderServiceError(res, error) {
  const knownError = error instanceof VisitorInformationError;
  if (!knownError) console.error("Visitor Information integration error:", error);
  const statusCode = knownError ? error.statusCode : 503;
  return res.status(statusCode).render("discover/unavailable", {
    title: statusCode === 404 ? "Visitor Record Not Found - CultureFrame" : "Visitor Information Unavailable - CultureFrame",
    notFound: statusCode === 404,
    message: knownError ? error.message : "Visitor Information is currently unavailable. Please try again later."
  });
}

export const discoverController = {
  index: async (_req, res) => {
    try {
      const home = await visitorInformationClient.getHome();
      return res.render("discover/index", {
        title: "Discover Mansalay - CultureFrame",
        modules: visitorModules,
        ...home
      });
    } catch (error) {
      return renderServiceError(res, error);
    }
  },

  list: async (req, res) => {
    try {
      const module = visitorModules.find(item => item.segment === req.params.module);
      if (!module) throw new VisitorInformationError("Unknown Visitor Information category.", { statusCode: 404 });
      const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
      const result = await visitorInformationClient.getList(module.segment, { q, page: pageNumber(req.query.page) });
      return res.render("discover/list", {
        title: `${module.label} - Discover - CultureFrame`,
        module,
        q,
        qEncoded: encodeURIComponent(q),
        ...result,
        ...pagination(result)
      });
    } catch (error) {
      return renderServiceError(res, error);
    }
  },

  search: async (req, res) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
      const category = typeof req.query.category === "string" ? req.query.category : "";
      const result = q
        ? await visitorInformationClient.search({ q, category, page: pageNumber(req.query.page) })
        : { items: [], total: 0, page: 1, pages: 1, portalUrl: null };
      return res.render("discover/search", {
        title: "Search Visitor Information - CultureFrame",
        q,
        qEncoded: encodeURIComponent(q),
        category,
        categoryEncoded: encodeURIComponent(category),
        searched: Boolean(q),
        modules: modulesForSelect(category),
        ...result,
        ...pagination(result)
      });
    } catch (error) {
      return renderServiceError(res, error);
    }
  },

  detail: async (req, res) => {
    try {
      const result = await visitorInformationClient.getDetail(req.params.module, req.params.slug);
      return res.render("discover/detail", {
        title: `${result.item.title} - Discover - CultureFrame`,
        ...result
      });
    } catch (error) {
      return renderServiceError(res, error);
    }
  }
};
