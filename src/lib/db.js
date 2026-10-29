import mysql from "mysql2/promise";

const REQUIRED = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD", "SESSION_SECRET"];

function createPool() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing ${missing.join(", ")} — run \`npm run db:migrate\`.`);

  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 10,
    maxIdle: 10, // keep warm connections instead of reopening (~130 ms each to the remote server)
    idleTimeout: 10 * 60 * 1000,
    connectTimeout: 10000,
    enableKeepAlive: true,
    dateStrings: true,
    decimalNumbers: true,
  });
  // Same rules on every connection regardless of server defaults: strict data checking
  // (reject, never silently truncate) and IST so "today" matches the quarry's day.
  pool.pool.on("connection", (conn) => {
    conn.query(
      "SET time_zone = ?, sql_mode = 'STRICT_ALL_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ZERO_DATE,NO_ZERO_IN_DATE,NO_ENGINE_SUBSTITUTION'",
      [process.env.DB_TZ || "+05:30"],
    );
  });
  return pool;
}

// Reuse one pool across hot reloads in dev.
export const pool = (globalThis.__neetaPool ??= createPool());

const SLOW_MS = 300;

export async function query(sql, params = []) {
  const started = performance.now();
  const [rows] = await pool.query(sql, params);
  const ms = performance.now() - started;
  if (ms > SLOW_MS) console.warn(`[db] slow query ${ms.toFixed(0)} ms: ${sql.replace(/\s+/g, " ").slice(0, 140)}`);
  return rows;
}

// Opens a few connections up front so the first visitors don't pay the connection cost.
export async function warmPool(n = 4) {
  await Promise.all(Array.from({ length: n }, () => pool.query("SELECT 1")));
}

// Runs fn(tx) atomically: every write inside either all happens or none does.
export async function transaction(fn) {
  const conn = await pool.getConnection();
  const tx = {
    query: async (sql, params = []) => (await conn.query(sql, params))[0],
  };
  try {
    await conn.beginTransaction();
    const result = await fn(tx);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

// Append-only record of who changed what. Call inside the same transaction as the change.
export function audit(tx, user, action, entity, entityId, details) {
  return tx.query(
    "INSERT INTO audit_log (user_id, username, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)",
    [user?.id ?? null, user?.username ?? null, action, entity, entityId ?? null, details ? JSON.stringify(details) : null],
  );
}

// Outstanding = unpaid balances from deliveries − later payments (deleted payments excluded).
export const CUSTOMER_BALANCES = `
  SELECT c.id, c.name, c.phone, c.address, c.created_at,
         COALESCE(o.orders, 0)  AS orders,
         COALESCE(o.billed, 0)  AS billed,
         COALESCE(o.paid, 0) + COALESCE(p.paid, 0) AS paid,
         COALESCE(o.balance, 0) - COALESCE(p.paid, 0) AS outstanding
  FROM customers c
  LEFT JOIN (
    SELECT customer_id, COUNT(*) AS orders, SUM(total_amount) AS billed,
           SUM(paid_amount) AS paid, SUM(balance_amount) AS balance
    FROM orders WHERE status = 'delivered' GROUP BY customer_id
  ) o ON o.customer_id = c.id
  LEFT JOIN (
    SELECT customer_id, SUM(amount) AS paid FROM customer_payments
    WHERE deleted_at IS NULL GROUP BY customer_id
  ) p ON p.customer_id = c.id`;
