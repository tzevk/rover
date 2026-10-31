-- 006: the operation itself. Materials and stock, production, weighbridge records, vehicles,
-- fuel and maintenance. New tables have no default company, so nothing can land in the wrong one.

CREATE TABLE materials (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id    INT UNSIGNED NOT NULL,
  name          VARCHAR(80) NOT NULL,
  unit          ENUM('tonne', 'brass', 'cft', 'cum') NOT NULL DEFAULT 'tonne',
  kg_per_unit   DECIMAL(10,2) NOT NULL DEFAULT 1000, -- turns a weighbridge net weight into this unit
  default_rate  DECIMAL(12,2) NOT NULL DEFAULT 0,
  opening_stock DECIMAL(12,2) NOT NULL DEFAULT 0,
  low_stock     DECIMAL(12,2) NOT NULL DEFAULT 0,    -- warn at or below this; 0 means no warning
  active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_materials_name (company_id, name),
  CONSTRAINT fk_materials_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT chk_materials_kg CHECK (kg_per_unit > 0),
  CONSTRAINT chk_materials_rate CHECK (default_rate >= 0),
  CONSTRAINT chk_materials_low CHECK (low_stock >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE production_entries (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id        INT UNSIGNED NOT NULL,
  prod_date         DATE NOT NULL,
  shift             ENUM('day', 'night') NOT NULL DEFAULT 'day',
  material_id       INT UNSIGNED NOT NULL,
  qty               DECIMAL(12,2) NOT NULL,
  input_material_id INT UNSIGNED NULL,     -- raw material used up, e.g. boulders
  input_qty         DECIMAL(12,2) NULL,
  note              VARCHAR(255) NULL,
  created_by        INT UNSIGNED NULL,
  request_id        CHAR(36) NULL,
  deleted_at        DATETIME NULL,
  deleted_by        INT UNSIGNED NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_production_request (request_id),
  INDEX idx_production_date (company_id, prod_date),
  CONSTRAINT fk_production_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_production_material FOREIGN KEY (material_id) REFERENCES materials (id),
  CONSTRAINT fk_production_input FOREIGN KEY (input_material_id) REFERENCES materials (id),
  CONSTRAINT fk_production_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_production_qty CHECK (qty > 0),
  CONSTRAINT chk_production_input CHECK ((input_material_id IS NULL AND input_qty IS NULL) OR (input_material_id IS NOT NULL AND input_qty > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A physical count. The difference is what corrects the book figure.
CREATE TABLE stock_counts (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id  INT UNSIGNED NOT NULL,
  material_id INT UNSIGNED NOT NULL,
  count_date  DATE NOT NULL,
  book_qty    DECIMAL(12,2) NOT NULL,
  counted_qty DECIMAL(12,2) NOT NULL,
  difference  DECIMAL(12,2) NOT NULL,
  note        VARCHAR(255) NULL,
  created_by  INT UNSIGNED NULL,
  request_id  CHAR(36) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_counts_request (request_id),
  INDEX idx_counts_material (company_id, material_id),
  CONSTRAINT fk_counts_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_counts_material FOREIGN KEY (material_id) REFERENCES materials (id),
  CONSTRAINT fk_counts_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_counts_counted CHECK (counted_qty >= 0),
  CONSTRAINT chk_counts_difference CHECK (difference = counted_qty - book_qty)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE vehicles (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  number     VARCHAR(20) NOT NULL,
  ownership  ENUM('own', 'outside') NOT NULL DEFAULT 'outside',
  driver     VARCHAR(100) NULL,
  phone      VARCHAR(20) NULL,
  tare_kg    DECIMAL(10,2) NULL,      -- last known empty weight
  active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_vehicles_number (company_id, number),
  CONSTRAINT fk_vehicles_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT chk_vehicles_tare CHECK (tare_kg IS NULL OR tare_kg > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Each fuel or repair record also creates its expense, so the daily accounts stay complete.
CREATE TABLE fuel_logs (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id  INT UNSIGNED NOT NULL,
  vehicle_id  INT UNSIGNED NOT NULL,
  log_date    DATE NOT NULL,
  litres      DECIMAL(10,2) NOT NULL,
  amount      DECIMAL(12,2) NOT NULL,
  odometer_km INT UNSIGNED NULL,
  expense_id  INT UNSIGNED NOT NULL,
  created_by  INT UNSIGNED NULL,
  request_id  CHAR(36) NULL,
  deleted_at  DATETIME NULL,
  deleted_by  INT UNSIGNED NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fuel_request (request_id),
  INDEX idx_fuel_vehicle (company_id, vehicle_id, log_date),
  CONSTRAINT fk_fuel_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_fuel_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles (id),
  CONSTRAINT fk_fuel_expense FOREIGN KEY (expense_id) REFERENCES expenses (id),
  CONSTRAINT fk_fuel_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_fuel_litres CHECK (litres > 0),
  CONSTRAINT chk_fuel_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE maintenance_logs (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id  INT UNSIGNED NOT NULL,
  vehicle_id  INT UNSIGNED NOT NULL,
  log_date    DATE NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount      DECIMAL(12,2) NOT NULL,
  next_due    DATE NULL,
  expense_id  INT UNSIGNED NOT NULL,
  created_by  INT UNSIGNED NULL,
  request_id  CHAR(36) NULL,
  deleted_at  DATETIME NULL,
  deleted_by  INT UNSIGNED NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_maintenance_request (request_id),
  INDEX idx_maintenance_vehicle (company_id, vehicle_id, log_date),
  CONSTRAINT fk_maint_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_maint_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles (id),
  CONSTRAINT fk_maint_expense FOREIGN KEY (expense_id) REFERENCES expenses (id),
  CONSTRAINT fk_maint_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_maint_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE companies
  ADD COLUMN address VARCHAR(255) NULL,
  ADD COLUMN phone VARCHAR(20) NULL,
  ADD COLUMN gstin VARCHAR(15) NULL;

ALTER TABLE customers ADD COLUMN credit_limit DECIMAL(14,2) NULL;

-- Old orders keep NULL here; they simply don't count towards any material's stock.
ALTER TABLE orders
  ADD COLUMN material_id INT UNSIGNED NULL,
  ADD COLUMN vehicle_id INT UNSIGNED NULL,
  ADD COLUMN gross_kg DECIMAL(10,2) NULL,
  ADD COLUMN tare_kg DECIMAL(10,2) NULL,
  ADD COLUMN net_kg DECIMAL(10,2) NULL,
  ADD COLUMN pass_no VARCHAR(40) NULL,
  ADD CONSTRAINT fk_orders_material FOREIGN KEY (material_id) REFERENCES materials (id),
  ADD CONSTRAINT fk_orders_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles (id),
  ADD CONSTRAINT chk_orders_tare CHECK (tare_kg IS NULL OR tare_kg > 0),
  ADD CONSTRAINT chk_orders_net CHECK (
    (net_kg IS NULL AND gross_kg IS NULL)
    OR (gross_kg IS NOT NULL AND tare_kg IS NOT NULL AND gross_kg > tare_kg AND net_kg = gross_kg - tare_kg)
  );
