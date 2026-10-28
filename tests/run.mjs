// End-to-end safety net:  npm test
//
// Starts a throwaway MySQL server, runs the real migrations, builds and starts the app against it,
// then drives every flow in Chrome and attacks the database directly to prove the safeguards hold.
// Never touches the live database. Needs a local `mysqld` (brew install mysql) and Google Chrome.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { execFileSync, spawn } from "node:child_process";
import mysql from "mysql2/promise";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const tmp = fs.mkdtempSync("/tmp/rqt-"); // short path: MySQL socket paths must be < 104 chars
const DB = "rq_test";
const ADMIN_PW = "test-admin-pass";
const children = [];
let passed = 0;

const check = (cond, msg) => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
};
async function rejects(promise, msg) {
  try { await promise; } catch { return check(true, msg); }
  check(false, msg);
}

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

function findMysqld() {
  const candidates = [process.env.MYSQLD, "/opt/homebrew/opt/mysql/bin/mysqld", "/usr/local/opt/mysql/bin/mysqld", "/usr/sbin/mysqld"];
  try { candidates.push(execFileSync("which", ["mysqld"]).toString().trim()); } catch {}
  const found = candidates.find((p) => p && fs.existsSync(p));
  if (!found) throw new Error("mysqld not found — install it with `brew install mysql` (or set MYSQLD=/path/to/mysqld).");
  return found;
}

async function waitFor(fn, label, ms = 60000) {
  const end = Date.now() + ms;
  for (;;) {
    try { return await fn(); } catch (err) {
      if (Date.now() > end) throw new Error(`${label} did not start: ${err.message}`);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

function run(cmd, args, env, { allowFail = false } = {}) {
  try {
    return execFileSync(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: "pipe" }).toString();
  } catch (err) {
    if (allowFail) return null;
    throw new Error(`${cmd} ${args.join(" ")} failed:\n${err.stdout}\n${err.stderr}`);
  }
}

async function main() {
  // ── 1. Throwaway database server
  console.log("▸ Starting a throwaway MySQL");
  const mysqld = findMysqld();
  const basedir = path.resolve(path.dirname(mysqld), "..");
  const dbPort = await freePort();
  execFileSync(mysqld, ["--initialize-insecure", `--datadir=${tmp}/data`, `--basedir=${basedir}`], { stdio: "pipe" });
  const db = spawn(mysqld, [
    `--datadir=${tmp}/data`, `--basedir=${basedir}`, `--port=${dbPort}`, `--socket=${tmp}/sock`,
    "--bind-address=127.0.0.1", "--mysqlx=OFF",
  ], { stdio: "ignore" });
  children.push(db);
  const rootConn = await waitFor(
    () => mysql.createConnection({ host: "127.0.0.1", port: dbPort, user: "root", multipleStatements: true, dateStrings: true }),
    "MySQL",
  );

  const dbEnv = {
    DB_HOST: "127.0.0.1", DB_PORT: String(dbPort), DB_NAME: DB,
    DB_OWNER_USER: "root", DB_OWNER_PASSWORD: "",
    ENV_FILE: `${tmp}/.env.test`, BACKUP_DIR: `${tmp}/backups`, SEED_ADMIN_PASSWORD: ADMIN_PW,
  };

  // ── 2. Migrations
  console.log("▸ Migrations");
  run("node", ["scripts/db.mjs", "migrate"], dbEnv);
  check(true, "fresh database migrates");
  run("node", ["scripts/db.mjs", "migrate"], dbEnv);
  check(true, "migrating again is a harmless no-op");
  await rootConn.query(`UPDATE ${DB}.schema_migrations SET checksum = REPEAT('0', 64) WHERE version = '001_initial.sql'`);
  check(run("node", ["scripts/db.mjs", "migrate"], dbEnv, { allowFail: true }) === null, "an edited, already-applied migration is refused");
  const sum = (await import("node:crypto")).createHash("sha256").update(fs.readFileSync(`${root}/db/migrations/001_initial.sql`)).digest("hex");
  await rootConn.query(`UPDATE ${DB}.schema_migrations SET checksum = ? WHERE version = '001_initial.sql'`, [sum]);

  const appEnv = Object.fromEntries(
    fs.readFileSync(dbEnv.ENV_FILE, "utf8").split("\n").map((l) => l.match(/^([A-Z0-9_]+)="(.*)"$/)).filter(Boolean).map((m) => [m[1], m[2]]),
  );
  const appConn = await mysql.createConnection({
    host: "127.0.0.1", port: dbPort, user: appEnv.DB_USER, password: appEnv.DB_PASSWORD, database: DB, dateStrings: true,
  });

  // ── 3. Database-level guarantees (attacking with the app's own login)
  console.log("▸ Database guarantees");
  await rejects(appConn.query("DELETE FROM users"), "app login cannot DELETE data");
  await rejects(appConn.query("DROP TABLE orders"), "app login cannot DROP tables");
  await rejects(appConn.query("ALTER TABLE orders ADD COLUMN x INT"), "app login cannot change the schema");
  await rejects(appConn.query("UPDATE audit_log SET action = 'x'"), "activity log cannot be edited");
  await rejects(appConn.query("DELETE FROM audit_log"), "activity log cannot be erased");
  await appConn.query("INSERT INTO customers (name) VALUES ('Rule Test')");
  const [[{ cid }]] = await appConn.query("SELECT id AS cid FROM customers WHERE name = 'Rule Test'");
  await rejects(appConn.query("INSERT INTO orders (customer_id, ordered_qty, rate, total_amount) VALUES (?, 10, 100, 999)", [cid]),
    "database rejects a total that isn't qty × rate");
  await rejects(appConn.query("INSERT INTO orders (customer_id, ordered_qty, rate, total_amount) VALUES (?, -1, 100, -100)", [cid]),
    "database rejects negative quantities");
  await rejects(appConn.query(
    "INSERT INTO orders (customer_id, ordered_qty, rate, total_amount, status) VALUES (?, 1, 100, 100, 'delivered')", [cid]),
    "database rejects a 'delivered' order with no vehicle, times or payment");
  await rejects(appConn.query("INSERT INTO expenses (expense_date, category, amount) VALUES ('2026-01-01', 'fuel', 0)"),
    "database rejects zero/negative expenses");
  await rejects(appConn.query("INSERT INTO expenses (expense_date, category, amount) VALUES ('2026-01-01', 'bribes', 10)"),
    "database rejects unknown expense types");

  // ── 4. Build and start the app against the test database
  console.log("▸ Building and starting the app");
  run(process.execPath, [`${root}/node_modules/next/dist/bin/next`, "build"], { NEXT_DIST_DIR: ".next-test" });
  const appPort = await freePort();
  if (process.env.KEEP_ON_FAIL || process.env.KEEP_SERVERS) console.log(`  app: http://localhost:${appPort}  db port: ${dbPort}`);
  // "localhost", not 127.0.0.1: Next.js rewrites 127.0.0.1 to localhost in redirects, which would drop cookies.
  const BASE = `http://localhost:${appPort}`;
  const app = spawn(process.execPath, [`${root}/node_modules/next/dist/bin/next`, "start", "-p", String(appPort)], {
    cwd: root, env: { ...process.env, ...appEnv, NODE_ENV: "production", NEXT_DIST_DIR: ".next-test" },
    stdio: ["ignore", fs.openSync(`${tmp}/app.log`, "a"), fs.openSync(`${tmp}/app.log`, "a")],
  });
  children.push(app);
  await waitFor(async () => { const r = await fetch(`${BASE}/api/health`); if (!r.ok) throw new Error(r.status); }, "App");
  const health = await (await fetch(`${BASE}/api/health`)).json();
  check(health.status === "ok" && health.schema === "003_longer_password_hash.sql", "health check reports app + database up");

  // ── 5. Browser flows
  const browser = await chromium.launch({ channel: "chrome" });
  const errors = [];
  const newPage = async (ctx) => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
    return p;
  };
  const login = async (page, user, pw) => {
    await page.goto(`${BASE}/login`);
    await page.fill("#username", user);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(350);
    await page.fill("#password", pw);
    await page.keyboard.press("Enter");
  };

  try {
    const adminCtx = await browser.newContext();
    const admin = await newPage(adminCtx);

    console.log("▸ Sign-in");
    await login(admin, "admin", "wrong-password");
    await admin.waitForSelector("text=Incorrect username or password");
    check(true, "wrong password is rejected");
    await admin.fill("#password", ADMIN_PW);
    await admin.keyboard.press("Enter");
    await admin.waitForSelector("h1:has-text('Dashboard')");
    check(true, "admin signs in");

    await admin.goto(`${BASE}/users`);
    await admin.fill('input[name="full_name"]', "Ramesh Patil");
    await admin.fill('input[name="username"]', "ramesh");
    await admin.fill('form:has(input[name="full_name"]) input[name="password"]', "worker123");
    await admin.click("text=Create login");
    await admin.waitForSelector("text=Login created for Ramesh Patil");
    await admin.goto(`${BASE}/staff`);
    for (const [name, wage] of [["Mahesh", "500"], ["Suresh", "600"]]) {
      await admin.fill('form:has(button:has-text("Add staff")) input[name="name"]', name);
      await admin.fill('form:has(button:has-text("Add staff")) input[name="daily_wage"]', wage);
      await admin.click('button:has-text("Add staff")');
      await admin.waitForSelector(`text=Added ${name}`);
    }
    check(true, "admin creates a worker login and staff");

    await admin.click('button[aria-label="Collapse sidebar"]');
    await admin.waitForSelector('.shell[data-collapsed="true"]');
    await admin.reload();
    check(await admin.isVisible('.shell[data-collapsed="true"]'), "collapsed sidebar is remembered after a reload");
    await admin.click('button[aria-label="Expand sidebar"]');
    await admin.waitForSelector('.shell[data-collapsed="false"]');

    console.log("▸ Worker flows");
    const workerCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const worker = await newPage(workerCtx);
    await login(worker, "ramesh", "worker123");
    await worker.waitForSelector(".page-eyebrow:has-text(\"Ramesh\")");
    check(await worker.evaluate(() => document.documentElement.scrollWidth) <= 390, "fits a phone screen without sideways scrolling");

    await worker.goto(`${BASE}/orders/new`);
    await worker.fill('input[placeholder="Search by name or phone…"]', "Shree Builders");
    await worker.click("text=Add new customer");
    await worker.fill(".inset input >> nth=1", "9876543210");
    await worker.click("text=Save customer");
    await worker.waitForSelector(".picked >> text=Shree Builders");
    await worker.fill('input[name="ordered_qty"]', "10");
    await worker.fill('input[name="rate"]', "1500");
    check(await worker.isVisible(".calc >> text=₹15,000"), "booking total is auto-calculated");

    // Capture the booking request so we can replay it exactly, like a network retry would.
    let booking;
    worker.on("request", (r) => { if (r.method() === "POST" && r.headers()["next-action"] && !booking) booking = r; });
    await worker.click("text=Book order");
    await worker.waitForSelector("text=Order #1 booked for Shree Builders");
    const replay = await workerCtx.request.post(booking.url(), { headers: booking.headers(), data: booking.postDataBuffer() });
    check(replay.ok() && (await replay.text()).includes("Already saved"), "a replayed submission is recognised as a repeat");
    const [[{ n: orderCount }]] = await appConn.query("SELECT COUNT(*) AS n FROM orders");
    check(orderCount === 1, "…and does not create a duplicate order");

    await worker.click('input[placeholder="Search by name or phone…"]');
    await worker.click(".picker-item >> text=Shree Builders");
    await worker.fill('input[name="ordered_qty"]', "9.33");
    await worker.fill('input[name="rate"]', "1234.57");
    await worker.click("text=Book order");
    await worker.waitForSelector("text=₹11,518.54");
    check(true, "awkward decimals (9.33 × 1234.57) pass the database's exact-money rule");

    await worker.goto(`${BASE}/deliveries/1`);
    await worker.fill('input[name="vehicle_number"]', "mh12ab1234");
    await worker.fill('input[name="delivered_qty"]', "9");
    await worker.fill('input[name="paid_amount"]', "5000");
    check(await worker.isVisible(".calc >> text=₹8,500"), "balance = (delivered qty × rate) − paid");
    await worker.click("text=Complete delivery");
    await worker.waitForURL(/deliveries\?done=1/);
    const [[{ secondId }]] = await appConn.query("SELECT MAX(id) AS secondId FROM orders");
    check(!(await worker.isVisible("td >> text=#1")) && (await worker.isVisible(`td >> text=#${secondId}`)), "completed order leaves the pending list");

    for (const p of ["/orders", "/customers", "/accounts", "/payroll", "/users", "/staff", "/activity"]) {
      await worker.goto(BASE + p);
      check(new URL(worker.url()).pathname === "/", `worker is kept out of ${p}`);
    }
    // The page streams (loading screen), so assert on what the worker sees rather than the status code.
    await worker.goto(`${BASE}/deliveries/1`);
    await worker.waitForSelector("text=Not found");
    check(!(await worker.isVisible("text=MH12AB1234")) && !(await worker.isVisible("text=Delivery details")),
      "worker cannot open a completed order");

    await worker.goto(`${BASE}/expenses`);
    await worker.selectOption('select[name="category"]', "fuel");
    await worker.fill('input[name="amount"]', "2400");
    await worker.click("text=Save expense");
    await worker.waitForSelector("text=Fuel expense of ₹2,400 saved");
    check(!(await worker.isVisible("text=Expense report")), "worker can add expenses but not see the report");

    await worker.goto(`${BASE}/attendance`);
    check(!(await worker.isVisible("text=Daily wage")), "worker never sees wages");
    await worker.click('label:has(input[value="present"]) >> nth=0');
    await worker.click('label:has(input[value="half_day"]) >> nth=1');
    await worker.click("text=Save attendance");
    await worker.waitForSelector("text=Attendance saved for 2 people");

    console.log("▸ Admin reports");
    await admin.goto(`${BASE}/customers`);
    check(await admin.isVisible("td.due >> text=₹8,500"), "customer balance updated from the delivery");
    await admin.click("text=Shree Builders");
    await admin.fill('input[name="amount"]', "2000");
    await admin.click("text=Record payment");
    await admin.waitForSelector("text=Payment of ₹2,000 recorded");
    await admin.reload();
    check(await admin.isVisible(".stat.accent >> text=₹6,500"), "later payment reduces the balance");
    await admin.goto(`${BASE}/accounts`);
    check(await admin.isVisible(".stat.accent >> text=₹4,600"), "daily net cash = 5,000 + 2,000 − 2,400");
    await admin.goto(`${BASE}/payroll`);
    check(await admin.isVisible("tfoot >> text=₹800"), "payroll = 500 (present) + 300 (half-day)");

    console.log("▸ Undo and history");
    await admin.goto(`${BASE}/expenses`);
    admin.once("dialog", (d) => d.accept());
    await admin.click('tr:has-text("Fuel") button');
    await admin.waitForSelector("text=No expenses in this range");
    const [[exp]] = await appConn.query("SELECT deleted_at FROM expenses LIMIT 1");
    check(exp.deleted_at !== null, "deleting an expense keeps the record (soft delete)");

    await admin.goto(`${BASE}/deliveries/1`);
    admin.once("dialog", (d) => d.accept());
    await admin.click("text=Reopen delivery");
    await admin.waitForSelector("text=Complete delivery");
    await admin.goto(`${BASE}/customers`);
    check(await admin.isVisible("text=₹2,000 adv."), "reopening a delivery reverses the customer balance");
    await admin.goto(`${BASE}/activity`);
    check(await admin.isVisible("text=Reopened delivery") && await admin.isVisible("text=Completed delivery"), "activity log shows who did what");

    console.log("▸ Sessions");
    await admin.goto(`${BASE}/users`);
    await admin.fill('tr:has-text("ramesh") input[name="password"]', "new-password-1");
    await admin.click('tr:has-text("ramesh") button:has-text("Set")');
    await admin.waitForSelector("text=Password updated");
    await worker.goto(`${BASE}/deliveries`);
    check(new URL(worker.url()).pathname === "/login", "resetting a password signs that person out immediately");
    await login(worker, "ramesh", "new-password-1");
    await worker.waitForSelector(".page-eyebrow:has-text(\"Ramesh\")");
    admin.once("dialog", (d) => d.accept());
    await admin.click('tr:has-text("ramesh") button:has-text("Disable")');
    await admin.waitForSelector('tr:has-text("ramesh") button:has-text("Enable")');
    await worker.goto(`${BASE}/orders/new`);
    check(new URL(worker.url()).pathname === "/login", "disabling a login signs that person out immediately");

    console.log("▸ Performance & cache");
    // An account still on the old bcrypt hash signs in fine and is upgraded to scrypt.
    const bcrypt = (await import("bcryptjs")).default;
    await rootConn.query(`INSERT INTO ${DB}.users (username, full_name, password_hash, role) VALUES ('legacy', 'Legacy User', ?, 'worker')`,
      [await bcrypt.hash("legacy-pass-1", 10)]);
    const legacyCtx = await browser.newContext();
    const legacy = await newPage(legacyCtx);
    await login(legacy, "legacy", "legacy-pass-1");
    await legacy.waitForSelector('.page-eyebrow:has-text("Legacy")');
    const [[{ password_hash: upgraded }]] = await rootConn.query(`SELECT password_hash FROM ${DB}.users WHERE username = 'legacy'`);
    check(upgraded.startsWith("scrypt$"), "an old-style password still works and is upgraded on sign-in");
    const t0 = performance.now();
    await admin.goto(`${BASE}/`);
    await admin.waitForSelector("h1:has-text('Dashboard')");
    const ms = performance.now() - t0;
    const stats = (await (await fetch(`${BASE}/api/health`)).json()).cache;
    check(stats.hits > 0, `cache is serving repeat reads (${stats.hits} hits, ${stats.hitRate}% hit rate; dashboard in ${ms.toFixed(0)} ms)`);

    check(errors.length === 0, `no browser errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  } catch (err) {
    // Leave screenshots of every open page behind so a failure can be seen, not guessed at.
    const dir = path.join(root, "tests/failures");
    fs.mkdirSync(dir, { recursive: true });
    let i = 0;
    for (const ctx of browser.contexts()) for (const p of ctx.pages()) await p.screenshot({ path: `${dir}/page-${i++}.png` }).catch(() => {});
    console.error(`  (screenshots saved to tests/failures/)`);
    throw err;
  } finally {
    await browser.close();
  }

  // ── 6. Backup → restore round trip
  console.log("▸ Backup and restore");
  run("node", ["scripts/db.mjs", "backup"], { ...dbEnv, DB_USER: appEnv.DB_USER, DB_PASSWORD: appEnv.DB_PASSWORD });
  const [backupFile] = fs.readdirSync(dbEnv.BACKUP_DIR);
  run("node", ["scripts/db.mjs", "restore", `${dbEnv.BACKUP_DIR}/${backupFile}`, "--into", "rq_restored"], dbEnv);
  const counts = async (schema) => {
    const [tables] = await rootConn.query("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ? ORDER BY t", [schema]);
    const out = {};
    for (const { t } of tables) out[t] = (await rootConn.query(`SELECT COUNT(*) AS n FROM \`${schema}\`.\`${t}\``))[0][0].n;
    return JSON.stringify(out);
  };
  check(await counts(DB) === await counts("rq_restored"), "a backup restores with every table and row intact");
  check(run("node", ["scripts/db.mjs", "restore", `${dbEnv.BACKUP_DIR}/${backupFile}`, "--into", DB], dbEnv, { allowFail: true }) === null,
    "restore refuses to overwrite a live database without --overwrite");

  await appConn.end();
  await rootConn.end();
  console.log(`\n✅ All ${passed} checks passed.\n`);
}

function cleanup() {
  for (const c of children.reverse()) { try { c.kill("SIGTERM"); } catch {} }
  // Anything still alive after a grace period is force-stopped, so no stray servers pile up.
  setTimeout(() => { for (const c of children) { try { c.kill("SIGKILL"); } catch {} } }, 1500);
  setTimeout(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(); // don't let a leftover connection keep the run alive after a failure
  }, 2000);
}

main()
  .then(() => {
    if (process.env.KEEP_SERVERS) return console.log(`  Servers left running (KEEP_SERVERS). Test files: ${tmp}`);
    cleanup();
  })
  .catch((err) => {
    console.error(`\n❌ ${err.message}\n`);
    process.exitCode = 1;
    if (process.env.KEEP_ON_FAIL) {
      console.error(`  Servers left running for inspection (KEEP_ON_FAIL). Test files: ${tmp}`);
      return;
    }
    cleanup();
  });
