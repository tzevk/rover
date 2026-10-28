# Rover Quarry

Orders, deliveries, customer ledgers, expenses and staff attendance for a quarry — with separate **Admin** (owner) and **Worker** (staff) access.

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
| Health check | `GET /api/health` → 200 when app + database are up, 503 otherwise (for an uptime monitor). |

## Who sees what

| | Worker | Admin |
|---|---|---|
| Book orders, add customers from booking | ✓ | ✓ |
| Pending deliveries (complete with vehicle, times, qty, payment) | ✓ | ✓ |
| Completed orders / order history | — | ✓ |
| Add expenses | ✓ | ✓ + report |
| Mark attendance | today only | any day + wages |
| Customer balances & ledgers, daily accounts, payroll, logins | — | ✓ |

Rules are enforced on the server (every page and action re-checks the role from the database), not just hidden in the menu.

## How the money works

- **Booking:** total = ordered qty × rate.
- **Delivery:** total = *delivered* qty × rate; balance = total − paid. The balance is added to the customer's ledger.
- **Later payments** (Admin, on the customer page) reduce the outstanding balance.
- **Salary:** Present = 1 day, Half-day = ½, Absent = 0, × daily wage.
