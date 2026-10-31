-- 005: demo requests from the public website.
CREATE TABLE enquiries (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  company       VARCHAR(120) NOT NULL,
  business_type VARCHAR(60)  NOT NULL,
  location      VARCHAR(120) NOT NULL,
  phone         VARCHAR(20)  NOT NULL,
  email         VARCHAR(120) NOT NULL,
  employees     VARCHAR(20)  NULL,
  requirements  TEXT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_enquiries_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
