-- 008: GST tax invoices. Off until an owner switches it on, so no company's prices change by surprise.
ALTER TABLE companies
  ADD COLUMN place VARCHAR(60) NULL,
  ADD COLUMN pincode CHAR(6) NULL,
  ADD COLUMN gst_enabled TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN rates_include_gst TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN invoice_prefix VARCHAR(4) NOT NULL DEFAULT 'INV',
  ADD COLUMN bank_details VARCHAR(255) NULL,
  ADD COLUMN invoice_terms VARCHAR(255) NULL,
  ADD COLUMN ewb_intra_limit DECIMAL(12,2) NOT NULL DEFAULT 50000;

ALTER TABLE customers
  ADD COLUMN gstin VARCHAR(15) NULL,
  ADD COLUMN state_code CHAR(2) NULL,
  ADD COLUMN place VARCHAR(60) NULL,
  ADD COLUMN pincode CHAR(6) NULL;

ALTER TABLE materials
  ADD COLUMN hsn_code VARCHAR(8) NOT NULL DEFAULT '2517',
  ADD COLUMN gst_rate DECIMAL(5,2) NOT NULL DEFAULT 5,
  ADD CONSTRAINT chk_materials_gst CHECK (gst_rate >= 0 AND gst_rate <= 40);

-- What the customer owes is still total_amount, so balances and reports keep working unchanged.
-- tax_inclusive means the rate already contained the tax, so it adds nothing to the total.
ALTER TABLE orders
  ADD COLUMN tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN tax_inclusive TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN place_of_supply CHAR(2) NULL;
ALTER TABLE orders DROP CONSTRAINT chk_orders_total;
ALTER TABLE orders ADD CONSTRAINT chk_orders_total
  CHECK (total_amount = ROUND(COALESCE(delivered_qty, ordered_qty) * rate, 2) + IF(tax_inclusive = 1, 0, tax_amount));

-- One running number per registration and financial year. Taken inside the delivery's transaction,
-- so a failed save gives its number back and the series stays free of gaps.
CREATE TABLE invoice_counters (
  company_id INT UNSIGNED NOT NULL,
  gstin      VARCHAR(15) NOT NULL,
  fy         CHAR(7) NOT NULL,
  last_no    INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, gstin, fy),
  CONSTRAINT fk_counters_company FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A legal document: everything printed on it is copied here, so editing a customer or a rate later
-- can never change an invoice already issued. Mistakes are cancelled, keeping the number.
CREATE TABLE invoices (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id       INT UNSIGNED NOT NULL,
  site_id          INT UNSIGNED NOT NULL,
  order_id         INT UNSIGNED NOT NULL,
  customer_id      INT UNSIGNED NOT NULL,
  number           VARCHAR(16) NOT NULL,
  fy               CHAR(7) NOT NULL,
  invoice_date     DATE NOT NULL,
  status           ENUM('issued', 'cancelled') NOT NULL DEFAULT 'issued',
  supplier_name    VARCHAR(120) NOT NULL,
  supplier_gstin   VARCHAR(15) NOT NULL,
  supplier_address VARCHAR(255) NULL,
  supplier_place   VARCHAR(60) NULL,
  supplier_pincode CHAR(6) NULL,
  supplier_phone   VARCHAR(20) NULL,
  buyer_name       VARCHAR(120) NOT NULL,
  buyer_gstin      VARCHAR(15) NULL,
  buyer_address    VARCHAR(255) NULL,
  buyer_place      VARCHAR(60) NULL,
  buyer_pincode    CHAR(6) NULL,
  place_of_supply  CHAR(2) NOT NULL,
  item_name        VARCHAR(80) NOT NULL,
  hsn_code         VARCHAR(8) NOT NULL,
  qty              DECIMAL(10,2) NOT NULL,
  unit             VARCHAR(10) NOT NULL,
  uqc              CHAR(3) NOT NULL,
  rate             DECIMAL(12,2) NOT NULL,
  rate_inclusive   TINYINT(1) NOT NULL DEFAULT 0,
  taxable_value    DECIMAL(14,2) NOT NULL,
  gst_rate         DECIMAL(5,2) NOT NULL,
  cgst             DECIMAL(14,2) NOT NULL DEFAULT 0,
  sgst             DECIMAL(14,2) NOT NULL DEFAULT 0,
  igst             DECIMAL(14,2) NOT NULL DEFAULT 0,
  total            DECIMAL(14,2) NOT NULL,
  vehicle_number   VARCHAR(20) NULL,
  pass_no          VARCHAR(40) NULL,
  bank_details     VARCHAR(255) NULL,
  invoice_terms    VARCHAR(255) NULL,
  distance_km      SMALLINT UNSIGNED NULL,
  ewb_no           CHAR(12) NULL,
  ewb_date         DATE NULL,
  created_by       INT UNSIGNED NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at     DATETIME NULL,
  cancelled_by     INT UNSIGNED NULL,
  UNIQUE KEY uq_invoices_number (company_id, supplier_gstin, fy, number),
  INDEX idx_invoices_date (company_id, invoice_date),
  INDEX idx_invoices_order (order_id),
  CONSTRAINT fk_invoices_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_invoices_site FOREIGN KEY (site_id) REFERENCES sites (id),
  CONSTRAINT fk_invoices_order FOREIGN KEY (order_id) REFERENCES orders (id),
  CONSTRAINT fk_invoices_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_invoices_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_invoices_total CHECK (total = taxable_value + cgst + sgst + igst),
  CONSTRAINT chk_invoices_split CHECK (cgst = sgst AND (igst = 0 OR cgst = 0)),
  CONSTRAINT chk_invoices_ewb CHECK (ewb_no IS NULL OR ewb_no REGEXP '^[0-9]{12}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
