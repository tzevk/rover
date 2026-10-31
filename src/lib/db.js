import mysql from "mysql2/promise";
import { cached, TAGS } from "./cache";
import { text } from "./validate";

const REQUIRED = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD", "SESSION_SECRET"];

function createPool() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing ${missing.join(", ")}, run \`npm run db:migrate\`.`);

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
    stringifyObjects: true, // an object sent as a value must never expand into SQL
    ...(process.env.DB_SSL === "1" ? { ssl: { rejectUnauthorized: true } } : {}),
  });
  // Same rules on every connection regardless of server defaults: strict data checking
  // (reject, never silently truncate) and IST so "today" matches the working day.
  pool.pool.on("connection", (conn) => {
    conn.query(
      "SET time_zone = ?, sql_mode = 'STRICT_ALL_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ZERO_DATE,NO_ZERO_IN_DATE,NO_ENGINE_SUBSTITUTION'",
      [process.env.DB_TZ || "+05:30"],
    );
  });
  return pool;
}

// Reuse one pool across hot reloads in dev.
export const pool = (globalThis.__rkPool ??= createPool());

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
    "INSERT INTO audit_log (company_id, user_id, username, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [user.company_id, user?.id ?? null, user?.username ?? null, action, entity, entityId ?? null, details ? JSON.stringify(details) : null],
  );
}

// Outstanding = unpaid balances from deliveries − later payments (deleted payments excluded).
export const customerBalances = (companyId) => `
  SELECT c.id, c.name, c.phone, c.address, c.created_at, c.credit_limit,
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
  ) p ON p.customer_id = c.id
  WHERE c.company_id = ${Number(companyId)}`;

// Stock isn't stored, it's worked out: opening + produced − used − delivered ± counts. So it can
// never drift from the records, and a reopened delivery puts its material straight back.
// With a site it's that site's stock. Opening stock sits at the company's first site.
export const stockLevels = (companyId, site = null) => {
  const cid = Number(companyId);
  const at = site ? ` AND site_id = ${Number(site.id)}` : "";
  const opening = site && !site.main ? "0" : "m.opening_stock";
  return `
  SELECT m.*, COALESCE(p.made, 0) AS produced, COALESCE(u.used_qty, 0) AS consumed, COALESCE(d.sold, 0) AS delivered,
         COALESCE(r.held, 0) AS reserved, COALESCE(c.diff, 0) AS adjusted,
         ${opening} + COALESCE(p.made, 0) - COALESCE(u.used_qty, 0) - COALESCE(d.sold, 0) + COALESCE(c.diff, 0) AS on_hand
  FROM materials m
  LEFT JOIN (SELECT material_id, SUM(qty) AS made FROM production_entries
             WHERE company_id = ${cid}${at} AND deleted_at IS NULL GROUP BY material_id) p ON p.material_id = m.id
  LEFT JOIN (SELECT input_material_id, SUM(input_qty) AS used_qty FROM production_entries
             WHERE company_id = ${cid}${at} AND deleted_at IS NULL AND input_material_id IS NOT NULL GROUP BY input_material_id) u ON u.input_material_id = m.id
  LEFT JOIN (SELECT material_id, SUM(delivered_qty) AS sold FROM orders
             WHERE company_id = ${cid}${at} AND status = 'delivered' AND material_id IS NOT NULL GROUP BY material_id) d ON d.material_id = m.id
  LEFT JOIN (SELECT material_id, SUM(ordered_qty) AS held FROM orders
             WHERE company_id = ${cid}${at} AND status = 'pending' AND material_id IS NOT NULL GROUP BY material_id) r ON r.material_id = m.id
  LEFT JOIN (SELECT material_id, SUM(difference) AS diff FROM stock_counts
             WHERE company_id = ${cid}${at} GROUP BY material_id) c ON c.material_id = m.id
  WHERE m.company_id = ${cid}`;
};

export const getStock = (companyId, site = null) =>
  cached(`stock:${companyId}:${site?.id ?? "all"}`, { tags: [TAGS.stock, TAGS.orders], ttl: 60 }, () => query(`${stockLevels(companyId, site)} ORDER BY m.active DESC, m.name`));

export const cleanVehicle = (v) => text(v, 20).toUpperCase().replace(/\s+/g, " ");

// Vehicles are remembered as they're used, so nobody has to set them up first.
// A new tare replaces the stored one; an empty tare leaves it alone.
export async function saveVehicleNumber(tx, companyId, number, tareKg) {
  const res = await tx.query(
    `INSERT INTO vehicles (company_id, number, tare_kg) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), tare_kg = COALESCE(VALUES(tare_kg), tare_kg)`,
    [companyId, number, tareKg ?? null],
  );
  return res.insertId;
}
