-- 003: room for scrypt password hashes (~135 chars; bcrypt's were 60).
ALTER TABLE users MODIFY password_hash VARCHAR(255) NOT NULL;
