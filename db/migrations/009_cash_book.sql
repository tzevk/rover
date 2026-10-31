-- 009: how each rupee moved, and the daily cash count. Existing records count as cash.
ALTER TABLE orders ADD COLUMN paid_mode ENUM('cash', 'upi', 'bank', 'cheque') NULL;
UPDATE orders SET paid_mode = 'cash' WHERE paid_amount > 0;

ALTER TABLE customer_payments ADD COLUMN mode ENUM('cash', 'upi', 'bank', 'cheque') NOT NULL DEFAULT 'cash';
ALTER TABLE expenses ADD COLUMN paid_from ENUM('cash', 'bank') NOT NULL DEFAULT 'cash';

-- One closing per site per day. The figures are kept as they stood when the cash was counted, so a
-- later edit to that day's records shows up as a change instead of quietly rewriting the closing.
CREATE TABLE cash_closings (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id    INT UNSIGNED NOT NULL,
  site_id       INT UNSIGNED NOT NULL,
  close_date    DATE NOT NULL,
  opening       DECIMAL(14,2) NOT NULL,
  cash_sales    DECIMAL(14,2) NOT NULL,
  cash_received DECIMAL(14,2) NOT NULL,
  cash_expenses DECIMAL(14,2) NOT NULL,
  deposited     DECIMAL(14,2) NOT NULL DEFAULT 0, -- taken out of the cash box: banked or handed to the owner
  expected      DECIMAL(14,2) NOT NULL,
  counted       DECIMAL(14,2) NOT NULL,
  difference    DECIMAL(14,2) NOT NULL,
  note          VARCHAR(255) NULL,
  closed_by     INT UNSIGNED NULL,
  closed_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_closings_day (company_id, site_id, close_date),
  CONSTRAINT fk_closings_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_closings_site FOREIGN KEY (site_id) REFERENCES sites (id),
  CONSTRAINT fk_closings_user FOREIGN KEY (closed_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_closings_expected CHECK (expected = opening + cash_sales + cash_received - cash_expenses - deposited),
  CONSTRAINT chk_closings_difference CHECK (difference = counted - expected),
  CONSTRAINT chk_closings_counted CHECK (counted >= 0 AND deposited >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
