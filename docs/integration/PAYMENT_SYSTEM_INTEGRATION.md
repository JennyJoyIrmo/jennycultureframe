# CultureFrame Payments Integration

## Source

- Repository: `https://github.com/Alexander23-Zues/cultureframe-payment-.git`
- Reviewed source commit: `b3f2752a682f21a13a299bf63089526d413aa589`
- CultureFrame branch: `integration/unified-cultureframe`

The payment application remains an independent service with its own React UI,
Prisma financial ledger, administrator authentication, and database. Its source
was not merged into Jenny's Express/Sequelize application. The services exchange
only explicitly authorized order and payment data over HTTPS.

## CultureFrame endpoints

Both endpoints require `Authorization: Bearer <PAYMENT_INTEGRATION_TOKEN>`.

### Pull eligible order lines

```http
GET /api/integrations/payments/orders?updatedAfter=<ISO-8601>&cursor=<opaque>
```

The response follows the payment service's existing import contract:

```json
{
  "orders": [],
  "nextCursor": null,
  "skipped": 0
}
```

Each seller-owned order line becomes a stable external payment order such as
`CF-ORDER-15-ITEM-42`. Multi-product and multi-seller CultureFrame orders are
therefore split safely without changing the payment service's one-line order
model. Items whose product has no linked seller are counted as `skipped` and are
not exported.

CultureFrame checkout recalculates each unit price and the full order total from
the database inside the stock-deduction transaction. Browser-submitted names,
prices, and totals are not used as financial source data.

### Receive verified financial events

```http
POST /api/integrations/payments/orders/:externalId/payment-events
Idempotency-Key: <stable-event-id>
Content-Type: application/json
```

Accepted payloads are the existing payment-service events:

```json
{
  "paymentReference": "PAY-2026-EXAMPLE",
  "status": "SUCCEEDED",
  "amountCents": 125000,
  "providerReference": "VERIFIED-TRANSFER-REFERENCE"
}
```

```json
{
  "refundReference": "RF-2026-EXAMPLE",
  "status": "COMPLETED",
  "amountCents": 25000
}
```

CultureFrame validates the order-line amount, records the event idempotently,
updates its local payment record, and derives the parent order's payment status.
Repeated delivery with the same idempotency key and payload is safe. Reusing a
key for different data returns HTTP 409.

## Environment configuration

Generate one random secret of at least 32 characters and store it privately in
both services. Do not commit the value.

CultureFrame:

```text
PAYMENT_INTEGRATION_TOKEN=<shared-random-secret>
PAYMENT_SYSTEM_URL=https://payments.example.com
```

Payment service:

```text
INTEGRATION_MODE=live
CULTUREFRAME_API_URL=https://cultureframe.example.com/api/integrations/payments
CULTUREFRAME_API_TOKEN=<same-shared-random-secret>
```

The payment service deliberately requires HTTPS in live mode. Use deployed
staging services or a trusted local HTTPS tunnel for end-to-end testing.

## Database update

Back up CultureFrame's database, configure `DATABASE_URL`, and run:

```powershell
npm run sync
```

This adds `orders.payment_status`, payment integration fields, and the
`payment_integration_events` idempotency table. Do not use `npm run migrate` on a
database containing important data because that command recreates tables.

## Activation checklist

1. Ensure every payable product is linked to the correct seller.
2. Back up and synchronize the CultureFrame schema.
3. Deploy both services over HTTPS with the same private integration token.
4. Run a payment-service manual synchronization.
5. Confirm imported order-line totals and seller identities in staging.
6. Verify one test payment and one refund, then confirm CultureFrame receives
   each event exactly once and updates the expected order.

No real gateway, deployment account, or production money movement was activated
by this code integration.
