-- 004: several companies on one system. All existing data becomes company 1, which never expires.
CREATE TABLE companies (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(120) NOT NULL,
  plan         ENUM('trial', 'paid') NOT NULL DEFAULT 'trial',
  access_until DATETIME NULL, -- NULL = no expiry
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO companies (id, name, plan, access_until) VALUES (1, 'R.K. Enterprises', 'paid', NULL);

-- One row per payment event, so a webhook delivered twice can't extend access twice.
CREATE TABLE billing_events (
  event_id   VARCHAR(100) PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  amount     INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_billing_company FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Added with a default to fill existing rows, then the default is removed, so any insert that
-- forgets the company fails instead of quietly landing in company 1.
ALTER TABLE users ADD COLUMN company_id INT UNSIGNED NOT NULL DEFAULT 1 AFTER id, ADD INDEX idx_users_company (company_id), ADD CONSTRAINT fk_users_company FOREIGN KEY (company_id) REFERENCES companies (id);
ALTER TABLE customers ADD COLUMN company_id INT UNSIGNED NOT NULL DEFAULT 1 AFTER id, ADD INDEX idx_customers_company (company_id), ADD CONSTRAINT fk_customers_company FOREIGN KEY (company_id) REFERENCES companies (id);
ALTER TABLE orders ADD COLUMN company_id INT UNSIGNED NOT NULL DEFAULT 1 AFTER id, ADD INDEX idx_orders_company (company_id), ADD CONSTRAINT fk_orders_company FOREIGN KEY (company_id) REFERENCES companies (id);
ALTER TABLE customer_payments ADD COLUMN company_id INT UNSIGNED NOT NULL DEFAULT 1 AFTER id, ADD INDEX idx_payments_company (company_id), ADD CONSTRAINT fk_payments_company FOREIGN KEY (company_id) REFERENCES companies (id);
ALTER TABLE expenses ADD COLUMN company_id INT UNSIGNED NOT NULL DEFAULT 1 AFTER id, ADD INDEX idx_expenses_company (company_id), ADD CONSTRAINT fk_expenses_company FOREIGN KEY (company_id) REFERENCES companies (id);
ALTER TABLE staff ADD COLUMN company_id INT UNSIGNED NOT NULL DEFAULT 1 AFTER id, ADD INDEX idx_staff_company (company_id), ADD CONSTRAINT fk_staff_company FOREIGN KEY (company_id) REFERENCES companies (id);
ALTER TABLE attendance ADD COLUMN company_id INT UNSIGNED NOT NULL DEFAULT 1 AFTER id, ADD INDEX idx_attendance_company (company_id), ADD CONSTRAINT fk_attendance_company FOREIGN KEY (company_id) REFERENCES companies (id);
ALTER TABLE audit_log ADD COLUMN company_id INT UNSIGNED NOT NULL DEFAULT 1 AFTER id, ADD INDEX idx_audit_company (company_id), ADD CONSTRAINT fk_audit_company FOREIGN KEY (company_id) REFERENCES companies (id);

ALTER TABLE users MODIFY company_id INT UNSIGNED NOT NULL;
ALTER TABLE customers MODIFY company_id INT UNSIGNED NOT NULL;
ALTER TABLE orders MODIFY company_id INT UNSIGNED NOT NULL;
ALTER TABLE customer_payments MODIFY company_id INT UNSIGNED NOT NULL;
ALTER TABLE expenses MODIFY company_id INT UNSIGNED NOT NULL;
ALTER TABLE staff MODIFY company_id INT UNSIGNED NOT NULL;
ALTER TABLE attendance MODIFY company_id INT UNSIGNED NOT NULL;
ALTER TABLE audit_log MODIFY company_id INT UNSIGNED NOT NULL;
