-- 002: safeguards — session revocation, duplicate-submit protection, soft deletes,
-- database-enforced business rules, and an append-only audit log.
-- Written in the SQL subset shared by MySQL 8.0.16+ and MariaDB 10.5+.

ALTER TABLE users ADD COLUMN session_version INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE customers
  ADD COLUMN request_id CHAR(36) NULL,
  ADD UNIQUE KEY uq_customers_request (request_id);

ALTER TABLE orders
  ADD COLUMN request_id CHAR(36) NULL,
  ADD UNIQUE KEY uq_orders_request (request_id);

ALTER TABLE customer_payments
  ADD COLUMN request_id CHAR(36) NULL,
  ADD COLUMN deleted_at DATETIME NULL,
  ADD COLUMN deleted_by INT UNSIGNED NULL,
  ADD UNIQUE KEY uq_payments_request (request_id);

ALTER TABLE expenses
  ADD COLUMN request_id CHAR(36) NULL,
  ADD COLUMN deleted_at DATETIME NULL,
  ADD COLUMN deleted_by INT UNSIGNED NULL,
  ADD UNIQUE KEY uq_expenses_request (request_id);

-- The money rules live in the database, so no code path can store numbers that don't add up.
ALTER TABLE orders
  ADD CONSTRAINT chk_orders_qty   CHECK (ordered_qty > 0),
  ADD CONSTRAINT chk_orders_rate  CHECK (rate > 0),
  ADD CONSTRAINT chk_orders_total CHECK (total_amount = ROUND(COALESCE(delivered_qty, ordered_qty) * rate, 2)),
  ADD CONSTRAINT chk_orders_state CHECK (
    (status = 'delivered'
      AND vehicle_number IS NOT NULL AND vehicle_number <> ''
      AND arrival_time IS NOT NULL AND dispatch_time IS NOT NULL AND dispatch_time >= arrival_time
      AND delivered_qty > 0 AND paid_amount >= 0
      AND balance_amount = total_amount - paid_amount
      AND delivered_at IS NOT NULL)
    OR
    (status <> 'delivered'
      AND delivered_qty IS NULL AND paid_amount IS NULL AND balance_amount IS NULL AND delivered_at IS NULL)
  );

ALTER TABLE customer_payments ADD CONSTRAINT chk_payments_amount CHECK (amount > 0);
ALTER TABLE expenses ADD CONSTRAINT chk_expenses_amount CHECK (amount > 0);
ALTER TABLE staff ADD CONSTRAINT chk_staff_wage CHECK (daily_wage >= 0);
ALTER TABLE customers ADD CONSTRAINT chk_customers_name CHECK (name <> '');
ALTER TABLE users ADD CONSTRAINT chk_users_username CHECK (username <> '');

-- Append-only: the app's database login may INSERT and SELECT here, never UPDATE or DELETE.
CREATE TABLE audit_log (
  id        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id   INT UNSIGNED NULL,
  username  VARCHAR(50) NULL,
  action    VARCHAR(40) NOT NULL,
  entity    VARCHAR(30) NOT NULL,
  entity_id INT UNSIGNED NULL,
  details   TEXT NULL,
  INDEX idx_audit_at (at),
  INDEX idx_audit_entity (entity, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
