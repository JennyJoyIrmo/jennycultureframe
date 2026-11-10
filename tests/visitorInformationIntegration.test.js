import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import hbs from "hbs";
import express from "express";

const originalEnvironment = {
  visitorUrl: process.env.VISITOR_INFORMATION_URL,
  nodeEnvironment: process.env.NODE_ENV
};

const {
  VisitorInformationError,
  resolveVisitorInformationUrl,
  visitorInformationClient
} = await import("../services/visitorInformationClient.js");

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test.afterEach(() => {
  if (originalEnvironment.visitorUrl === undefined) delete process.env.VISITOR_INFORMATION_URL;
  else process.env.VISITOR_INFORMATION_URL = originalEnvironment.visitorUrl;
  if (originalEnvironment.nodeEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalEnvironment.nodeEnvironment;
});

test("loads and normalizes the Visitor Information homepage", async () => {
  let requestedUrl;
  const result = await visitorInformationClient.getHome({
    baseUrl: "http://127.0.0.1:5174",
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      assert.equal(options.method, "GET");
      assert.equal(options.headers.Accept, "application/json");
      assert.equal(options.redirect, "error");
      return jsonResponse({
        content: { heroTitle: "Living Mansalay", heroDescription: "Published stories" },
        featured: [{
          id: "record-1",
          kind: "HERITAGE",
          title: "Hanunuo Mangyan Writing",
          slug: "hanunuo-mangyan-writing",
          summary: "A living writing tradition.",
          description: "Documented by the community.",
          featured: true
        }],
        upcoming: []
      });
    }
  });

  assert.equal(requestedUrl.toString(), "http://127.0.0.1:5174/api/home");
  assert.equal(result.content.heroTitle, "Living Mansalay");
  assert.equal(result.featured.length, 1);
  assert.equal(result.featured[0].url, "/discover/heritage/hanunuo-mangyan-writing");
});

test("uses only allowlisted category paths and encodes list filters", async () => {
  let requestedUrl;
  const result = await visitorInformationClient.getList("historical-sites", {
    q: "old plaza & hall",
    page: 2,
    baseUrl: "https://visitor.example.test",
    fetchImpl: async url => {
      requestedUrl = url;
      return jsonResponse({ items: [], total: 0, page: 2, pages: 1 });
    }
  });

  assert.equal(requestedUrl.pathname, "/api/historical-sites");
  assert.equal(requestedUrl.searchParams.get("q"), "old plaza & hall");
  assert.equal(requestedUrl.searchParams.get("page"), "2");
  assert.equal(result.items.length, 0);

  await assert.rejects(
    visitorInformationClient.getList("../admin", { baseUrl: "https://visitor.example.test", fetchImpl: async () => jsonResponse({}) }),
    error => error instanceof VisitorInformationError && error.code === "UNKNOWN_MODULE"
  );
});

test("loads only a matching published detail record", async () => {
  const result = await visitorInformationClient.getDetail("events", "mangyan-day", {
    baseUrl: "https://visitor.example.test",
    fetchImpl: async url => {
      assert.equal(url.pathname, "/api/events/mangyan-day");
      return jsonResponse({
        item: {
          id: "event-1",
          kind: "EVENT",
          title: "Mangyan Day",
          slug: "mangyan-day",
          summary: "A community gathering.",
          description: "A published cultural event.",
          payload: { location: "Mansalay Plaza", eventDate: "2026-11-15" }
        }
      });
    }
  });

  assert.equal(result.item.location, "Mansalay Plaza");
  assert.equal(result.item.eventDate, "2026-11-15");
  assert.equal(result.item.segment, "events");
});

test("requires configuration and HTTPS for non-local production services", () => {
  delete process.env.VISITOR_INFORMATION_URL;
  assert.throws(
    () => resolveVisitorInformationUrl(),
    error => error instanceof VisitorInformationError && error.code === "NOT_CONFIGURED"
  );

  process.env.NODE_ENV = "production";
  assert.throws(
    () => resolveVisitorInformationUrl("http://visitor.example.test"),
    error => error instanceof VisitorInformationError && error.code === "INSECURE_CONFIGURATION"
  );
  assert.equal(resolveVisitorInformationUrl("http://127.0.0.1:5174").origin, "http://127.0.0.1:5174");
});

test("rejects non-JSON upstream responses", async () => {
  await assert.rejects(
    visitorInformationClient.getHome({
      baseUrl: "https://visitor.example.test",
      fetchImpl: async () => new Response("<html>not json</html>", { status: 200, headers: { "content-type": "text/html" } })
    }),
    error => error instanceof VisitorInformationError && error.code === "INVALID_RESPONSE"
  );
});

test("all Discover templates compile with the application partials", () => {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const partialDirectory = path.join(projectRoot, "views", "partials");
  for (const filename of fs.readdirSync(partialDirectory).filter(name => name.endsWith(".xian"))) {
    hbs.registerPartial(filename.replace(/\.xian$/, ""), fs.readFileSync(path.join(partialDirectory, filename), "utf8"));
  }

  const context = {
    content: { heroTitle: "Discover", heroDescription: "Published records" },
    modules: [],
    featured: [],
    upcoming: [],
    items: [],
    item: { segment: "heritage", categoryLabel: "Heritage", title: "Test record" },
    module: { segment: "heritage", label: "Heritage", icon: "fa-landmark", description: "Records" },
    total: 0,
    page: 1,
    pages: 1
  };

  const discoverDirectory = path.join(projectRoot, "views", "discover");
  for (const filename of fs.readdirSync(discoverDirectory).filter(name => name.endsWith(".xian"))) {
    const template = hbs.compile(fs.readFileSync(path.join(discoverDirectory, filename), "utf8"));
    assert.match(template(context), /<html lang="en">/);
  }
});

test("CultureFrame serves the federated Discover page from the Visitor API", async () => {
  const visitorServer = http.createServer((request, response) => {
    if (request.url !== "/api/home") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Not found" }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      content: { heroTitle: "Connected Mansalay Archive", heroDescription: "Published by the Visitor Information team." },
      featured: [],
      upcoming: []
    }));
  });
  await new Promise(resolve => visitorServer.listen(0, "127.0.0.1", resolve));

  const previousVisitorUrl = process.env.VISITOR_INFORMATION_URL;
  let cultureFrameServer;

  try {
    const visitorAddress = visitorServer.address();
    process.env.VISITOR_INFORMATION_URL = `http://127.0.0.1:${visitorAddress.port}`;

    const { default: discoverRouter } = await import("../routes/discover.js");
    const app = express();
    app.use((request, response, next) => {
      response.render = (view, data) => response.json({ view, data });
      next();
    });
    app.use("/discover", discoverRouter);
    cultureFrameServer = app.listen(0, "127.0.0.1");
    await new Promise(resolve => cultureFrameServer.once("listening", resolve));
    const cultureFrameAddress = cultureFrameServer.address();
    const response = await fetch(`http://127.0.0.1:${cultureFrameAddress.port}/discover`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.view, "discover/index");
    assert.equal(body.data.content.heroTitle, "Connected Mansalay Archive");
    assert.equal(body.data.modules.length, 7);
    assert.equal(body.data.modules[0].segment, "heritage");
  } finally {
    if (cultureFrameServer) await new Promise(resolve => cultureFrameServer.close(resolve));
    await new Promise(resolve => visitorServer.close(resolve));
    if (previousVisitorUrl === undefined) delete process.env.VISITOR_INFORMATION_URL;
    else process.env.VISITOR_INFORMATION_URL = previousVisitorUrl;
  }
});
