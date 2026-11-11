# Visitor Information Integration

## Source

- Repository: `https://github.com/gregoriobea/Visitor-Information.git`
- Reviewed source commit: `876588899ea975d20c26fa97a16461b89c5da50a`
- CultureFrame branch: `integration/unified-cultureframe`

Visitor Information remains an independent TypeScript/Express/Prisma service
with its own database, administrator publishing workflow, media records, and
public React portal. Its source and tables were not copied into Jenny's
Express/Sequelize application. Jenny's application reads its published public
API over HTTP(S).

## Source-of-truth rule

Visitor Information owns visitor-facing cultural documentation:

- heritage and historical sites;
- traditions;
- informational cultural events;
- attractions and festivals; and
- local-product stories that provide cultural context.

Jenny's application continues to own commerce, carts, purchasable products,
orders, sellers, payments, customer accounts, and event registrations. A local
product in Visitor Information is informational and never supplies a checkout
price or stock count. Existing `/heritage`, `/events`, `/scenic`, and `/crafts`
pages remain available while the team reviews legacy local content; the new
`/discover` area is the authoritative federated entry point.

## CultureFrame routes

| Route | Visitor API used |
| --- | --- |
| `GET /discover` | `GET /api/home` |
| `GET /discover/search` | `GET /api/search` |
| `GET /discover/:category` | `GET /api/:category` |
| `GET /discover/:category/:slug` | `GET /api/:category/:slug` |

The allowed categories are explicitly limited to `heritage`,
`historical-sites`, `traditions`, `events`, `attractions`, `festivals`, and
`local-products`. CultureFrame never proxies arbitrary paths or forwards user
cookies, sessions, authorization headers, or administrator credentials.

Remote text is normalized and rendered through Handlebars escaping. Requests
have an eight-second timeout, accept JSON only, reject oversized responses, and
show a controlled unavailable page when the service is offline or unconfigured.

## Environment configuration

Set the public root of the Visitor Information deployment:

```text
VISITOR_INFORMATION_URL=https://visitor.example.com
```

The configured URL may use HTTP on localhost for development. A non-local
production deployment must use HTTPS. Do not add `/api` to the value; the client
adds that path itself.

For local development, start the Visitor Information backend and point this
variable to the origin that serves its `/api/*` routes. The two applications can
use different ports and databases.

## Activation checklist

1. Deploy the Visitor Information backend and database.
2. Publish at least one test record through its administrator workflow.
3. Set `VISITOR_INFORMATION_URL` in Jenny's deployment.
4. Open `/discover`, a category, a detail record, and global search.
5. Stop the Visitor service once in staging and confirm the controlled
   unavailable page appears.
6. Confirm that Visitor local products do not enter Jenny's cart or checkout.

No Visitor database migration, production deployment, or content import was run
as part of this code integration.
