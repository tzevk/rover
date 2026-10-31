# R.K. Enterprises

Orders, deliveries, customer ledgers, expenses and staff attendance for quarry businesses — with separate **Admin** (owner) and **Worker** (staff) access.

## Commands

```bash
npm run dev          # http://localhost:3000
npm test             # full safety net on a throwaway database (never touches live data)
npm run db:migrate   # apply new migrations + reset app-login privileges (asks for the owner password)
npm run db:backup    # backups/query-<time>.sql.gz, newest 30 kept
npm run db:restore -- backups/<file>.sql.gz                      # restore into a NEW database to inspect
npm run db:restore -- backups/<file>.sql.gz --into query --overwrite   # replace live (auto-backs-up first)
```

Run `npm test` before every change goes live. Run `npm run db:backup` daily (or schedule it).

Live runs MariaDB, so test on it too: `brew install mariadb@10.11`, then `MYSQLD=/opt/homebrew/opt/mariadb@10.11/bin/mariadbd npm test`.

**Going live with a database change:** run `npm run db:backup`, then `npm run db:migrate` with the owner login, and only then push. A push to `master` deploys straight away, and new code reading tables that don't exist yet takes most of the app down.

## Safeguards

| Layer | Guarantee |
|---|---|
| Least-privilege login | The app connects as `query_app`: SELECT/INSERT/UPDATE only. It can never delete rows, drop tables or change the schema. |
| Database rules (CHECK constraints) | Totals must equal qty × rate, balance must equal total − paid, a delivered order must have vehicle/times/qty/payment, amounts must be positive. Enforced by MariaDB itself. |
| Transactions | Every save happens completely or not at all. |
| Activity log | Every change records who, what and when. The app login can only append to it, never edit or erase it. |
| Soft deletes + reopen | Deleted expenses/payments stay in the database; a wrong delivery can be reopened, which reverses the balance. |
| Repeat-safe submissions | Each form submission carries an id; a double-tap or network retry can't save twice. |
| Instant sign-out | Disabling a login or resetting a password ends that person's sessions everywhere at once. |
| Versioned migrations | `db/migrations/NNN_*.sql`, applied once in order. Editing an applied file is detected and refused, so add a new file instead. |
| Friendly failures | If the database is unreachable, users see "nothing was saved, try again", never a crash or half-saved record. |
| Health check | `GET /api/health` → 200 when app + database are up, 503 otherwise (for an uptime monitor). Set `HEALTH_DETAILS=1` to include schema and cache stats. |
| Login limits | 5 tries per username + IP, 20 per username, 30 per IP, in 10 minutes. |
| Request limits | 3,000 requests and 150 saves a minute per IP. In-memory: one server process. |
| Security headers | CSP, HSTS, nosniff and frame blocking, set in `next.config.mjs`. |
| HTTPS | Terminate TLS at a reverse proxy that sets `X-Forwarded-Proto`, then set `FORCE_HTTPS=1`. |
| Database TLS | Set `DB_SSL=1` once the database server has TLS enabled. |

## Performance

| Layer | What it does |
|---|---|
| App cache (`src/lib/cache.js`) | Keeps hot reads in memory: the signed-in user, the pending badge, dashboard totals, customer lists, balances. Every save invalidates exactly the tags it touches, after its transaction commits, so numbers are never stale. Concurrent misses share one query. Hit rate is shown at `/api/health` with `HEALTH_DETAILS=1`. |
| Warm connection pool | `src/instrumentation.js` opens database connections at startup; idle ones are kept for 10 minutes instead of reconnecting (~130 ms each). |
| Password hashing | Native scrypt (~20 ms, off the main thread) instead of pure-JS bcrypt (~190 ms, blocking every other request). Old bcrypt hashes still work and are upgraded on next sign-in. |
| Slow-query log | Any query over 300 ms is logged as `[db] slow query`. |

Always run the production build for real use (`npm run build && npm start`): `npm run dev` compiles each page the first time it opens, which makes sign-in take seconds instead of under 100 ms.

## Public site

`/` shows the marketing site to visitors and the dashboard to signed-in people; `/mr` is the Marathi version, plus five capability pages. Copy lives in `src/components/landing/content.js` and `seo-pages.js`. Only list a feature as available once it exists. Demo requests appear at `/enquiries` for company 1. In production set `SITE_URL` (the real address, used for canonical links and the sitemap) and `CONTACT_PHONE` (with country code) and/or `CONTACT_EMAIL` for the contact section.

The opening film is `src/components/landing/Scene.js`, with its ground, routes and camera shots in `world.js`. A ruled page rises into a quarry, one amber thread follows a load through nine stops with a progress rail (`Experience.js`), then the quarry folds flat into the finished register. There are no model or texture files: everything is generated in the browser, and light is baked once so phones get the same shadows. Reduced motion, slow or data-saving connections, low-memory phones and browsers without WebGL2 skip it: they get `public/quarry.webp` and the stops as a plain list. If the look changes, retake that picture from the opening shot.

## Companies and billing

Each company's data is separated by `company_id` on every table; every query filters on the signed-in user's company. `company_id` has no default, so a missed insert fails rather than landing in the wrong company. Company 1 is the original business and never expires. Public sign-up is off; set `SIGNUP_ENABLED=1` to open `/signup` (14-day trial). Usernames are unique across all companies.

Billing uses Razorpay Payment Links; each payment adds 30 days. Set `PLAN_PRICE_INR`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`, and point a Razorpay webhook for `payment_link.paid` at `/api/billing/webhook`.

## Quarry operations

| Area | How it works |
|---|---|
| Stock | Never stored. Calculated from opening stock + production − raw material used − deliveries ± physical counts (`stockLevels` in `src/lib/db.js`), so it can't drift from the records. Booked orders reduce what's *available*, not what's on hand. |
| Weighbridge | Two-stage: weigh in empty and "Save arrival", then weigh out loaded and complete. Net converts to the material's unit via *kg per unit*. Trucks and their empty weights are remembered automatically. |
| Reading an indicator | `src/components/WeighButton.js` uses Web Serial (Chrome or Edge on a computer, over HTTPS). Parsing lives in `src/lib/weight.mjs`; a weight is only accepted once it repeats 5 times. Formats vary by indicator make, so check each new one. |
| Fuel and repairs | Each entry also creates its expense in the same transaction. Deleting that expense removes the record too. |
| Needs attention | `src/lib/alerts.js`, with its thresholds at the top of the file. |
| Old data | Orders from before materials existed have no material and don't affect stock. A company with no materials keeps the original flow. |

## Billing and compliance

| Area | How it works |
|---|---|
| GST invoices | Off until an owner switches them on in Company. Every delivery then issues an invoice in the same transaction (`src/lib/dispatch.js`). The arithmetic is in `src/lib/gst.mjs`, in whole paise. |
| Invoice numbers | One series per GSTIN and financial year, in `invoice_counters`. The row stays locked until the delivery commits, so numbers can't repeat and a failed save leaves no gap. |
| Issued invoices | Everything printed is copied into `invoices`, so later edits can't change one. Reopening a delivery cancels its invoice and keeps the number. |
| Tax rates | Per material, defaulting to HSN 2517 at 5%. These are defaults: an accountant should confirm them. |
| GSTR-1 | `/gst` sorts a month into CSV working sheets. They're working papers, not the portal's upload format, and nothing is filed from here. |
| E-way bills | `src/lib/ewaybill.mjs` writes the JSON for the portal's Generate Bulk screen, whose key names differ from the portal's API. The bill itself is generated on the portal and its number typed back in. |
| Royalty | Passes come from the State's portal, which has no public API we could find. `/royalty` keeps the register, stops a pass being used twice and tracks permit quantities. |
| Tally | `src/lib/tally.mjs` writes UTF-16 XML for TallyPrime's Import screens. A cloud server can't reach Tally on an office computer, so this works by file. A person confirms each import, which is what stops it being sent twice. |
| Daily cash | `/cash` works out what should be in the box from cash records only. Days nobody closed roll into the next closing. Figures are kept as counted, so a later edit shows up as a change. |
| Sites | Every company has at least one, and all records carry `site_id`. Stock, deliveries, production and cash follow the chosen site; opening stock sits at the first site. Stock moved between sites isn't tracked. |

**Not built:** e-invoicing (IRN), credit notes, and live links to government portals.

## Offline at the gate

`public/sw.js` keeps `/gate` and its scripts on the device, and only those: signed-in pages are never cached. `src/lib/offline.js` keeps a snapshot of names and rates, and a queue of entries, in IndexedDB.

Entries are saved to the device first, then sent to `/api/offline/sync` in order. Each carries its own id in `orders.offline_ref`, so a repeat can never make a second delivery. Sync uses the same `completeDelivery` as the online form. An entry leaves the queue only once the server confirms it. A refused entry stays on the device with the reason, to retry or discard.

A device must sign in once with a connection first. Invoice numbers are issued on reaching the server, because two offline devices can't safely share a series, so the gate slip isn't a tax invoice.

## Who sees what

| | Worker | Admin |
|---|---|---|
| Book orders, add customers from booking | ✓ | ✓ |
| Pending deliveries (complete with vehicle, times, qty, payment) | ✓ | ✓ |
| Completed orders / order history | — | ✓ |
| Add expenses | ✓ | ✓ + report |
| Mark attendance | today only | any day + wages |
| Record production, fuel and repairs; see stock | ✓ | ✓ |
| Print challans (quantities and weights, no prices) | ✓ | ✓ |
| Customer balances & ledgers, daily accounts, payroll, logins, alerts | — | ✓ |
| Materials, stock counts, vehicle records, CSV export | — | ✓ |

Rules are enforced on the server (every page and action re-checks the role from the database), not just hidden in the menu.

## How the money works

- **Booking:** total = ordered qty × rate.
- **Delivery:** total = *delivered* qty × rate; balance = total − paid. The balance is added to the customer's ledger.
- **Later payments** (Admin, on the customer page) reduce the outstanding balance.
- **Salary:** Present = 1 day, Half-day = ½, Absent = 0, × daily wage.
