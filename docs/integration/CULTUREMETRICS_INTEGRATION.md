# CultureMetrics Integration

## Source

- Repository: `https://github.com/joerel12/AQUILIZAN-CULTURE-METRICS-SYSTEM.git`
- Reviewed source commit: `d02da1f`
- CultureFrame branch: `integration/unified-cultureframe`

CultureMetrics remains an independent React/Express analytics application with
its own administrator authentication, optional PostgreSQL diagnostic archive,
reports, and deployment. Jenny's CultureFrame application remains the source of
truth for orders, payments, products, customers, event registrations, heritage,
and scenic destinations.

The systems communicate through read-only, server-to-server REST endpoints.
CultureMetrics receives only the operational fields needed for aggregate
analytics; customer names, email addresses, phone numbers, shipping addresses,
and passwords are never returned.

## Authentication

Generate a random secret containing at least 32 characters and store the same
value privately in both deployments. Do not commit the secret.

CultureFrame:

```text
CULTUREMETRICS_INTEGRATION_TOKEN=<shared-random-secret>
CULTUREMETRICS_SYSTEM_URL=https://metrics.example.com
```

CultureMetrics:

```text
CULTUREFRAME_API_URL=https://cultureframe.example.com
CULTUREFRAME_API_TOKEN=<same-shared-random-secret>
CULTUREFRAME_INTEGRATION_ENABLED=true
CULTUREMETRICS_DATA_MODE=live
```

Every analytics request must send
`Authorization: Bearer <CULTUREMETRICS_INTEGRATION_TOKEN>`. Token comparison is
timing-safe. Valid authenticated traffic is limited to 120 requests per minute
per CultureFrame process.

## Implemented endpoints

| Method and path | Data returned |
| --- | --- |
| `GET /api/integrations/analytics/overview` | Aggregate dashboard totals |
| `GET /api/integrations/analytics/orders` | Orders, line items, payment state, and refunds |
| `GET /api/integrations/analytics/products` | Catalog and qualifying sales totals |
| `GET /api/integrations/analytics/customers/summary` | Anonymous customer aggregates only |
| `GET /api/integrations/analytics/events` | Events and registration counts |
| `GET /api/integrations/analytics/heritage` | Heritage records and publication state |
| `GET /api/integrations/analytics/scenic` | Scenic records, coordinates, and publication state |

List endpoints support `page` and `limit`; the maximum page size is 200.
Orders, overview, customers, and events accept inclusive `startDate` and
`endDate` values in `YYYY-MM-DD` format. Invalid pagination or dates return a
structured HTTP 400 response.

CultureFrame maps its order states to the CultureMetrics contract:

| CultureFrame state | CultureMetrics state |
| --- | --- |
| `pending` | `pending` |
| `confirmed`, `shipped` | `processing` |
| `delivered` | `completed` |
| `cancelled` | `cancelled` |

An order qualifies for sales analytics when it is delivered/completed or has an
explicit `paid` payment state. Monetary values are emitted as two-decimal PHP
strings. Shipping, discounts, and taxes are currently `0.00` because Jenny's
order schema does not track them separately. Event attendance remains `null`
because CultureFrame tracks registration but not check-in.

## Activation checklist

1. Deploy the integration branch of CultureFrame and deploy CultureMetrics.
2. Configure the same strong token on both servers.
3. Set CultureMetrics to `live` mode and enable its CultureFrame integration.
4. In CultureMetrics, test the required overview endpoint.
5. Run a data check and review rejected-record diagnostics.
6. Compare one order, product total, customer aggregate, and event count with
   CultureFrame administrator records.
7. Confirm no personal customer fields appear in any analytics response.

No production deployment, database migration, or live-mode switch was performed
as part of this code integration.
