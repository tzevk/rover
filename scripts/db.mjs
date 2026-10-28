// Database operations for Rover Quarry.
//
//   npm run db:migrate                 apply new migrations, fix app-login privileges, write .env.local
//   npm run db:backup                  full backup → backups/<db>-<time>.sql.gz (keeps the newest 30)
//   npm run db:restore -- <file>       restore into a NEW database (safe, for checking a backup)
//   npm run db:restore -- <file> --into <db> --overwrite
//                                      restore over a live database (takes a backup of it first)
//
// migrate/restore need the database OWNER login (asked for, or DB_OWNER_USER / DB_OWNER_PASSWORD).
// The app itself runs with a separate, restricted login that can never delete or drop data.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import readline from "node:readline";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ENV_FILE = path.resolve(root, process.env.ENV_FILE || ".env.local");
const MIGRATIONS_DIR = path.join(root, "db/migrations");
const BACKUP_DIR = path.resolve(root, process.env.BACKUP_DIR || "backups");
const KEEP_BACKUPS = 30;

const fileEnv = readEnvFile();
const cfg = {
  host: process.env.DB_HOST || fileEnv.DB_HOST || "94.103.163.250",
  port: Number(process.env.DB_PORT || fileEnv.DB_PORT || 3306),
  database: process.env.DB_NAME || fileEnv.DB_NAME || "query",
};
cfg.appUser = process.env.APP_DB_USER || `${cfg.database}_app`.slice(0, 32);

// Privileges the app login gets on each table. Anything not listed gets SELECT, INSERT, UPDATE.
// No table ever gets DELETE/DROP/ALTER: removing data is done with soft deletes.
const TABLE_PRIVILEGES = {
  audit_log: "SELECT, INSERT",
  schema_migrations: "SELECT",
};

const secret = (bytes) => crypto.randomBytes(bytes).toString("base64url");
const log = (...a) => console.log(...a);

function readEnvFile() {
  if (!fs.existsSync(ENV_FILE)) return {};
  return Object.fromEntries(
    fs.readFileSync(ENV_FILE, "utf8").split("\n")
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
}

function writeEnvFile(values) {
  const body = Object.entries(values).map(([k, v]) => `${k}="${v}"`).join("\n") + "\n";
  fs.writeFileSync(ENV_FILE, body, { mode: 0o600 });
}

function ask(question, { hidden = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) rl._writeToOutput = (s) => rl.output.write(s.startsWith(question) ? s : "");
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    }),
  );
}

async function ownerConnection({ database = cfg.database } = {}) {
  const user = process.env.DB_OWNER_USER || (await ask(`Database owner username [${cfg.database}]: `)) || cfg.database;
  const password = process.env.DB_OWNER_PASSWORD ?? (await ask("Database owner password: ", { hidden: true }));
  const conn = await mysql.createConnection({
    host: cfg.host, port: cfg.port, user, password,
    multipleStatements: true, connectTimeout: 15000, dateStrings: true,
  });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`).catch(() => {});
  await conn.query(`USE \`${database}\``);
  log(`✓ Connected to ${cfg.host}:${cfg.port}/${database} as ${user}`);
  return conn;
}

// ───────────────────────── migrate ─────────────────────────

const checksum = (sql) => crypto.createHash("sha256").update(sql).digest("hex");

async function applyMigrations(conn) {
  await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    VARCHAR(100) PRIMARY KEY,
    checksum   CHAR(64) NOT NULL,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  const [rows] = await conn.query("SELECT version, checksum FROM schema_migrations");
  const applied = new Map(rows.map((r) => [r.version, r.checksum]));
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();

  let ran = 0;
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const sum = checksum(sql);
    if (applied.has(file)) {
      if (applied.get(file) !== sum) {
        throw new Error(`${file} was edited after it was applied. Revert it and put the change in a new migration file.`);
      }
      continue;
    }
    log(`  → applying ${file}`);
    try {
      await conn.query(sql);
    } catch (err) {
      throw new Error(`${file} failed: ${err.message}\n  MySQL can't roll back schema changes; fix the cause, then check which statements already ran.`);
    }
    await conn.query("INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)", [file, sum]);
    ran++;
  }
  log(ran ? `✓ Applied ${ran} migration(s)` : "✓ Schema already up to date");
}

async function configureAppUser(conn, password) {
  const user = cfg.appUser;
  await conn.query("CREATE USER IF NOT EXISTS ?@'%' IDENTIFIED BY ?", [user, password]);
  await conn.query("ALTER USER ?@'%' IDENTIFIED BY ?", [user, password]);
  // Start from nothing, then grant exactly what's needed, table by table.
  await conn.query("REVOKE ALL PRIVILEGES, GRANT OPTION FROM ?@'%'", [user]);
  const [tables] = await conn.query(
    "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'",
    [cfg.database],
  );
  for (const { t } of tables) {
    const privs = TABLE_PRIVILEGES[t] ?? "SELECT, INSERT, UPDATE";
    await conn.query(`GRANT ${privs} ON \`${cfg.database}\`.\`${t}\` TO ?@'%'`, [user]);
  }
  await conn.query("FLUSH PRIVILEGES").catch(() => {});
  log(`✓ App login '${user}' can only read/add/update (${tables.length} tables, no delete/drop)`);
}

async function seedAdmin(conn) {
  const [[{ n }]] = await conn.query("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'");
  if (n > 0) return null;
  const login = { username: "admin", password: process.env.SEED_ADMIN_PASSWORD || secret(9) };
  const [res] = await conn.query(
    "INSERT INTO users (username, full_name, password_hash, role) VALUES (?, 'Owner', ?, 'admin')",
    [login.username, await bcrypt.hash(login.password, 12)],
  );
  await conn.query(
    "INSERT INTO audit_log (action, entity, entity_id, details) VALUES ('user.create', 'user', ?, ?)",
    [res.insertId, JSON.stringify({ username: login.username, role: "admin", via: "setup" })],
  );
  return login;
}

async function migrate() {
  log(`\n▸ Migrating ${cfg.database}\n`);
  const conn = await ownerConnection();
  try {
    await applyMigrations(conn);

    // Keep the existing app password unless the app is still using some other login.
    const reuse = fileEnv.DB_USER === cfg.appUser && fileEnv.DB_PASSWORD;
    const appPassword = reuse ? fileEnv.DB_PASSWORD : secret(24);
    await configureAppUser(conn, appPassword);

    const admin = await seedAdmin(conn);
    writeEnvFile({
      DB_HOST: cfg.host,
      DB_PORT: String(cfg.port),
      DB_NAME: cfg.database,
      DB_USER: cfg.appUser,
      DB_PASSWORD: appPassword,
      DB_TZ: fileEnv.DB_TZ || "+05:30",
      SESSION_SECRET: fileEnv.SESSION_SECRET || secret(48),
      NEXT_PUBLIC_APP_NAME: fileEnv.NEXT_PUBLIC_APP_NAME || "Rover Quarry",
    });
    log(`✓ Wrote ${path.relative(root, ENV_FILE)} (app login only — the owner password is not stored)`);

    if (admin) {
      log("\n  First sign-in (shown once — save it):");
      log(`    Username: ${admin.username}`);
      log(`    Password: ${admin.password}\n`);
    }
  } finally {
    await conn.end();
  }
}

// ───────────────────────── backup ─────────────────────────

async function backup({ connection, database = cfg.database, quiet = false } = {}) {
  const conn = connection ?? await mysql.createConnection({
    host: cfg.host, port: cfg.port, database,
    user: process.env.DB_USER || fileEnv.DB_USER,
    password: process.env.DB_PASSWORD ?? fileEnv.DB_PASSWORD,
    dateStrings: true, connectTimeout: 15000,
  });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const file = path.join(BACKUP_DIR, `${database}-${stamp}.sql.gz`);
  const gz = zlib.createGzip();
  const out = fs.createWriteStream(file, { mode: 0o600 });
  gz.pipe(out);
  const write = (s) => gz.write(s + "\n");

  try {
    // One consistent snapshot: every table is captured at the same instant.
    await conn.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await conn.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
    const [tables] = await conn.query(
      "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE' ORDER BY table_name",
      [database],
    );
    write(`-- Rover Quarry backup of \`${database}\` at ${new Date().toISOString()}`);
    write("SET FOREIGN_KEY_CHECKS = 0;");
    write("SET NAMES utf8mb4;");
    let rowCount = 0;
    for (const { t } of tables) {
      const [[create]] = await conn.query(`SHOW CREATE TABLE \`${t}\``);
      write(`\nDROP TABLE IF EXISTS \`${t}\`;`);
      write(`${create["Create Table"]};`);
      const [rows] = await conn.query({ sql: `SELECT * FROM \`${t}\``, rowsAsArray: true });
      for (let i = 0; i < rows.length; i += 500) {
        write(mysql.format("INSERT INTO ?? VALUES ?;", [t, rows.slice(i, i + 500)]));
      }
      rowCount += rows.length;
    }
    write("\nSET FOREIGN_KEY_CHECKS = 1;");
    write("-- end of backup");
    await conn.query("COMMIT");
    gz.end();
    await new Promise((resolve, reject) => out.on("finish", resolve).on("error", reject));
    if (!quiet) log(`✓ Backed up ${tables.length} tables, ${rowCount} rows → ${path.relative(root, file)}`);
  } finally {
    if (!connection) await conn.end();
  }

  // Rotate: keep the newest KEEP_BACKUPS files for this database.
  const mine = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith(`${database}-`) && f.endsWith(".sql.gz")).sort();
  for (const old of mine.slice(0, Math.max(0, mine.length - KEEP_BACKUPS))) fs.unlinkSync(path.join(BACKUP_DIR, old));
  return file;
}

// ───────────────────────── restore ─────────────────────────

async function restore(args) {
  const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--into");
  if (!file || !fs.existsSync(file)) throw new Error("Usage: npm run db:restore -- <backup.sql.gz> [--into <db> --overwrite]");
  const intoIdx = args.indexOf("--into");
  const target = intoIdx >= 0 ? args[intoIdx + 1] : `${cfg.database}_restore_${Date.now().toString(36)}`;
  const sql = zlib.gunzipSync(fs.readFileSync(file)).toString("utf8");
  if (!sql.trimEnd().endsWith("-- end of backup")) throw new Error("This backup file is incomplete or damaged — refusing to restore it.");

  const conn = await ownerConnection({ database: target });
  try {
    const [[{ n }]] = await conn.query(
      "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ?", [target],
    );
    if (n > 0) {
      if (!args.includes("--overwrite")) {
        throw new Error(`Database \`${target}\` already has tables. Add --overwrite to replace it (a backup is taken first).`);
      }
      const safety = await backup({ connection: conn, database: target, quiet: true });
      log(`✓ Safety backup of current \`${target}\` → ${path.relative(root, safety)}`);
    }
    await conn.query(sql);
    log(`✓ Restored into \`${target}\``);
    if (target === cfg.database) {
      await configureAppUser(conn, process.env.DB_PASSWORD ?? fileEnv.DB_PASSWORD);
    } else {
      log(`  Check it, then restore over the live database with --into ${cfg.database} --overwrite if needed.`);
    }
  } finally {
    await conn.end();
  }
}

// ───────────────────────── main ─────────────────────────

const [command, ...args] = process.argv.slice(2);
const commands = { migrate, backup: () => backup(), restore: () => restore(args) };

if (!commands[command]) {
  console.error("Usage: node scripts/db.mjs <migrate|backup|restore>");
  process.exit(1);
}
commands[command]().catch((err) => {
  console.error("\n✗", err.code ? `${err.code}:` : "", err.message);
  if (["ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND"].includes(err.code)) {
    console.error("  Can't reach the database server — check the internet connection and that port 3306 is open.");
  }
  process.exit(1);
});
