# Kyla Seller Module Integration

## Source

- Repository: `https://github.com/kylasalmorin08-ui/CultureFrame.git`
- Reviewed source commit: `83afe885366dc2618917813dc4d65b0378664294`
- Integration branch: `integration/unified-cultureframe`

The source project supplied a seller dashboard, seller-owned inventory workflow,
product-category management, and image validation. It used a separate product
schema and a development-only hard-coded seller ID. Those tables were not copied
over Jenny's existing CultureFrame tables.

## Integrated design

The seller workflow now uses Jenny's existing authentication and commerce data:

- `users.role` accepts `seller`.
- `sellers.user_id` links an approved seller profile to its login account.
- `products.seller_id` records product ownership.
- `products.status` controls storefront visibility.
- `product_categories` stores the shared category catalog.
- `/seller/*` requires an authenticated, active seller and scopes every product
  query and mutation to that seller.
- Seller image uploads accept JPEG, PNG, or WebP files up to 3 MB and verify file
  signatures rather than trusting the filename or browser MIME value.
- Products with order history are archived instead of deleted.

The original public shop remains `/shop`. Only products with `status=active` are
visible through its list and detail routes.

## Administrator workflow

1. Sign in as an administrator.
2. Open **Seller Management** and add a seller.
3. Enter a temporary password containing at least 12 characters.
4. Set the seller status to `active` when the seller may access the workspace.
5. Give the temporary password to the seller through a private channel.

Existing seller rows have no linked user. Edit the seller and enter a new
password to create the missing login account. Leaving that field blank keeps the
seller record unlinked.

## Database update

Back up the database first, then run:

```powershell
npm run sync
```

The sync adds nullable ownership fields so existing products and sellers remain
valid. Existing products default to `active` and remain visible. Administrator-
created products may continue to have no `seller_id`.

Do not use `npm run migrate` on a database containing important data: the current
project migration script recreates all tables.

## Verification performed

- JavaScript syntax checks for every changed and added module.
- Express seller-route registration and model-field load check.
- Seller-role authentication module load check.
- Seller access-control check for unauthenticated and active-seller requests.
- `git diff --check` whitespace validation.

A live database migration and end-to-end browser test still require a configured
PostgreSQL database through `DATABASE_URL`.
