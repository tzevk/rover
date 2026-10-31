-- 011: Tally export tracking, and entries made without a connection.
ALTER TABLE companies
  ADD COLUMN tally_company VARCHAR(120) NULL,
  ADD COLUMN tally_ledgers TEXT NULL; -- JSON of ledger names that differ from the usual ones

-- Set when the owner confirms an import, so the next file holds only what's new.
ALTER TABLE orders ADD COLUMN tally_exported_at DATETIME NULL;
ALTER TABLE invoices ADD COLUMN tally_exported_at DATETIME NULL;
ALTER TABLE customer_payments ADD COLUMN tally_exported_at DATETIME NULL;
ALTER TABLE expenses ADD COLUMN tally_exported_at DATETIME NULL;

-- The id a device gave an entry made offline. Sending it twice can never make a second delivery.
ALTER TABLE orders
  ADD COLUMN offline_ref CHAR(36) NULL,
  ADD UNIQUE KEY uq_orders_offline (offline_ref);
