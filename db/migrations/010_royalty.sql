-- 010: royalty register and permit limits. Passes come from the State's portal; this keeps the
-- register straight: every load, its pass, the royalty due and what's left on each permit.
ALTER TABLE companies ADD COLUMN pass_required TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE materials
  ADD COLUMN royalty_per_unit DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD CONSTRAINT chk_materials_royalty CHECK (royalty_per_unit >= 0);

-- The royalty is copied onto each delivery, so a later rate change can't alter past months.
-- A pass number covers one load: the unique key stops the same pass being used twice.
ALTER TABLE orders
  ADD COLUMN royalty_amount DECIMAL(12,2) NULL,
  ADD UNIQUE KEY uq_orders_pass (company_id, pass_no);

CREATE TABLE royalty_permits (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id  INT UNSIGNED NOT NULL,
  site_id     INT UNSIGNED NOT NULL,
  material_id INT UNSIGNED NULL,           -- NULL = counts every royalty-bearing material at the site
  permit_no   VARCHAR(60) NOT NULL,
  valid_from  DATE NOT NULL,
  valid_to    DATE NOT NULL,
  qty_allowed DECIMAL(14,2) NOT NULL,
  note        VARCHAR(255) NULL,
  active      TINYINT(1) NOT NULL DEFAULT 1,
  created_by  INT UNSIGNED NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_permits_number (company_id, permit_no),
  CONSTRAINT fk_permits_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_permits_site FOREIGN KEY (site_id) REFERENCES sites (id),
  CONSTRAINT fk_permits_material FOREIGN KEY (material_id) REFERENCES materials (id),
  CONSTRAINT fk_permits_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_permits_dates CHECK (valid_to >= valid_from),
  CONSTRAINT chk_permits_qty CHECK (qty_allowed > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
