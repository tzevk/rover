import { query } from "./db";

export const royaltyRegister = (cid, from, to) => query(
  `SELECT o.id, o.dispatch_time, o.pass_no, o.vehicle_number, o.delivered_qty, o.royalty_amount, m.name AS material, m.unit, c.name AS customer, s.name AS site
   FROM orders o JOIN customers c ON c.id = o.customer_id JOIN materials m ON m.id = o.material_id JOIN sites s ON s.id = o.site_id
   WHERE o.company_id = ? AND o.status = 'delivered' AND o.royalty_amount IS NOT NULL AND DATE(o.dispatch_time) BETWEEN ? AND ?
   ORDER BY o.dispatch_time, o.id`,
  [cid, from, to],
);

// Live permits and what's been carried against each one.
export const permitBalances = (cid) => query(
  `SELECT p.*, m.name AS material, m.unit, s.name AS site,
          (SELECT COALESCE(SUM(o.delivered_qty), 0) FROM orders o
           WHERE o.company_id = p.company_id AND o.site_id = p.site_id AND o.status = 'delivered' AND o.royalty_amount IS NOT NULL
             AND (p.material_id IS NULL OR o.material_id = p.material_id)
             AND DATE(o.dispatch_time) BETWEEN p.valid_from AND p.valid_to) AS used
   FROM royalty_permits p
   JOIN sites s ON s.id = p.site_id
   LEFT JOIN materials m ON m.id = p.material_id
   WHERE p.company_id = ? AND p.active = 1
   ORDER BY p.valid_to`,
  [cid],
);
