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
