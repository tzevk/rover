-- 007: several sites under one company. Every company starts with one site and all of its records
-- move onto it, so nothing changes for a business until it adds a second site.
CREATE TABLE sites (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  name       VARCHAR(80) NOT NULL,
  address    VARCHAR(255) NULL,
  place      VARCHAR(60) NULL,
  pincode    CHAR(6) NULL,
  gstin      VARCHAR(15) NULL, -- only when this site has its own registration, e.g. in another State
  active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sites_name (company_id, name),
  CONSTRAINT fk_sites_company FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO sites (company_id, name, address) SELECT id, 'Main site', address FROM companies;

-- NULL = may work at any site. A set site pins the login to it.
ALTER TABLE users
  ADD COLUMN site_id INT UNSIGNED NULL AFTER company_id,
  ADD CONSTRAINT fk_users_site FOREIGN KEY (site_id) REFERENCES sites (id);

-- Filled from the company's only site, then made compulsory so nothing can be saved without one.
ALTER TABLE orders ADD COLUMN site_id INT UNSIGNED NULL AFTER company_id;
ALTER TABLE customer_payments ADD COLUMN site_id INT UNSIGNED NULL AFTER company_id;
ALTER TABLE expenses ADD COLUMN site_id INT UNSIGNED NULL AFTER company_id;
ALTER TABLE production_entries ADD COLUMN site_id INT UNSIGNED NULL AFTER company_id;
ALTER TABLE stock_counts ADD COLUMN site_id INT UNSIGNED NULL AFTER company_id;

UPDATE orders t JOIN sites s ON s.company_id = t.company_id SET t.site_id = s.id;
UPDATE customer_payments t JOIN sites s ON s.company_id = t.company_id SET t.site_id = s.id;
UPDATE expenses t JOIN sites s ON s.company_id = t.company_id SET t.site_id = s.id;
UPDATE production_entries t JOIN sites s ON s.company_id = t.company_id SET t.site_id = s.id;
UPDATE stock_counts t JOIN sites s ON s.company_id = t.company_id SET t.site_id = s.id;

ALTER TABLE orders
  MODIFY site_id INT UNSIGNED NOT NULL,
  ADD INDEX idx_orders_site (company_id, site_id, status),
  ADD CONSTRAINT fk_orders_site FOREIGN KEY (site_id) REFERENCES sites (id);
ALTER TABLE customer_payments
  MODIFY site_id INT UNSIGNED NOT NULL,
  ADD INDEX idx_payments_site (company_id, site_id, paid_on),
  ADD CONSTRAINT fk_payments_site FOREIGN KEY (site_id) REFERENCES sites (id);
ALTER TABLE expenses
  MODIFY site_id INT UNSIGNED NOT NULL,
  ADD INDEX idx_expenses_site (company_id, site_id, expense_date),
  ADD CONSTRAINT fk_expenses_site FOREIGN KEY (site_id) REFERENCES sites (id);
ALTER TABLE production_entries
  MODIFY site_id INT UNSIGNED NOT NULL,
  ADD INDEX idx_production_site (company_id, site_id, prod_date),
  ADD CONSTRAINT fk_production_site FOREIGN KEY (site_id) REFERENCES sites (id);
ALTER TABLE stock_counts
  MODIFY site_id INT UNSIGNED NOT NULL,
  ADD INDEX idx_counts_site (company_id, site_id, material_id),
  ADD CONSTRAINT fk_counts_site FOREIGN KEY (site_id) REFERENCES sites (id);
