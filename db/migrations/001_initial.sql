-- 001: initial schema (MySQL 8 / MariaDB 10.5+). Never edit an applied migration — add a new file.

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  full_name     VARCHAR(100) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  role          ENUM('admin','worker') NOT NULL DEFAULT 'worker',
  active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customers (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  phone      VARCHAR(20)  NULL,
  address    VARCHAR(255) NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_customers_name (name),
  CONSTRAINT fk_customers_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS orders (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id    INT UNSIGNED NOT NULL,
  ordered_qty    DECIMAL(10,2) NOT NULL,
  rate           DECIMAL(12,2) NOT NULL,
  -- Booking: ordered_qty x rate. On delivery it becomes delivered_qty x rate.
  total_amount   DECIMAL(14,2) NOT NULL,
  status         ENUM('pending','delivered','cancelled') NOT NULL DEFAULT 'pending',
  vehicle_number VARCHAR(20)  NULL,
  arrival_time   DATETIME     NULL,
  dispatch_time  DATETIME     NULL,
  delivered_qty  DECIMAL(10,2) NULL,
  paid_amount    DECIMAL(14,2) NULL,
  balance_amount DECIMAL(14,2) NULL,
  booked_by      INT UNSIGNED NULL,
  delivered_by   INT UNSIGNED NULL,
  booked_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered_at   DATETIME NULL,
  INDEX idx_orders_status (status),
  INDEX idx_orders_booked (booked_at),
  INDEX idx_orders_delivered (delivered_at),
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_orders_booked_by FOREIGN KEY (booked_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_orders_delivered_by FOREIGN KEY (delivered_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Later payments a customer makes against their outstanding balance.
CREATE TABLE IF NOT EXISTS customer_payments (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  amount      DECIMAL(14,2) NOT NULL,
  paid_on     DATE NOT NULL,
  note        VARCHAR(255) NULL,
  recorded_by INT UNSIGNED NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_payments_date (paid_on),
  CONSTRAINT fk_payments_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_payments_user FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS expenses (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  expense_date DATE NOT NULL,
  category     ENUM('fuel','maintenance','transport','food_tea','other') NOT NULL,
  amount       DECIMAL(12,2) NOT NULL,
  description  VARCHAR(255) NULL,
  created_by   INT UNSIGNED NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_expenses_date (expense_date),
  CONSTRAINT fk_expenses_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Quarry staff whose attendance is tracked (they don't need app logins).
CREATE TABLE IF NOT EXISTS staff (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  phone      VARCHAR(20)  NULL,
  daily_wage DECIMAL(10,2) NOT NULL DEFAULT 0,
  active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attendance (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  staff_id  INT UNSIGNED NOT NULL,
  att_date  DATE NOT NULL,
  status    ENUM('present','absent','half_day') NOT NULL,
  marked_by INT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attendance_day (staff_id, att_date),
  INDEX idx_attendance_date (att_date),
  CONSTRAINT fk_attendance_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_user FOREIGN KEY (marked_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
