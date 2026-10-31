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
  if (!found) throw new Error("mysqld not found, install it with `brew install mysql` (or set MYSQLD=/path/to/mysqld).");
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
  // Production runs MariaDB: MYSQLD=/opt/homebrew/opt/mariadb@10.11/bin/mariadbd npm test
  const mariadb = path.basename(mysqld) === "mariadbd";
  if (mariadb) {
    execFileSync(`${basedir}/bin/mariadb-install-db`, ["--no-defaults", `--datadir=${tmp}/data`, `--basedir=${basedir}`,
      "--auth-root-authentication-method=normal", "--skip-test-db"], { stdio: "pipe" });
  } else {
    execFileSync(mysqld, ["--initialize-insecure", `--datadir=${tmp}/data`, `--basedir=${basedir}`], { stdio: "pipe" });
  }
  const db = spawn(mysqld, [
    ...(mariadb ? ["--no-defaults"] : []),
    `--datadir=${tmp}/data`, `--basedir=${basedir}`, `--port=${dbPort}`, `--socket=${tmp}/sock`,
    "--bind-address=127.0.0.1", ...(mariadb ? [] : ["--mysqlx=OFF"]),
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

  const [[{ mainSite }]] = await appConn.query("SELECT MIN(id) AS mainSite FROM sites WHERE company_id = 1");

  // ── 3. Database-level guarantees (attacking with the app's own login)
  console.log("▸ Database guarantees");
  await rejects(appConn.query("DELETE FROM users"), "app login cannot DELETE data");
  await rejects(appConn.query("INSERT INTO customers (name) VALUES ('No Company')"), "a record can't be saved without a company");
  await rejects(appConn.query("DROP TABLE orders"), "app login cannot DROP tables");
  await rejects(appConn.query("ALTER TABLE orders ADD COLUMN x INT"), "app login cannot change the schema");
  await rejects(appConn.query("UPDATE audit_log SET action = 'x'"), "activity log cannot be edited");
  await rejects(appConn.query("DELETE FROM audit_log"), "activity log cannot be erased");
  await appConn.query("INSERT INTO customers (company_id, name) VALUES (1, 'Rule Test')");
  const [[{ cid }]] = await appConn.query("SELECT id AS cid FROM customers WHERE name = 'Rule Test'");
  await rejects(appConn.query("INSERT INTO orders (company_id, customer_id, ordered_qty, rate, total_amount) VALUES (1, ?, 10, 100, 1000)", [cid]),
    "an order can't be saved without a site");
  await rejects(appConn.query("INSERT INTO orders (company_id, site_id, customer_id, ordered_qty, rate, total_amount) VALUES (1, ?, ?, 10, 100, 999)", [mainSite, cid]),
    "database rejects a total that isn't qty × rate");
  await rejects(appConn.query("INSERT INTO orders (company_id, site_id, customer_id, ordered_qty, rate, total_amount) VALUES (1, ?, ?, -1, 100, -100)", [mainSite, cid]),
    "database rejects negative quantities");
  await rejects(appConn.query(
    "INSERT INTO orders (company_id, site_id, customer_id, ordered_qty, rate, total_amount, status) VALUES (1, ?, ?, 1, 100, 100, 'delivered')", [mainSite, cid]),
    "database rejects a 'delivered' order with no vehicle, times or payment");
  await rejects(appConn.query("INSERT INTO orders (company_id, site_id, customer_id, ordered_qty, rate, total_amount, tax_amount) VALUES (1, ?, ?, 10, 100, 1000, 50)", [mainSite, cid]),
    "database rejects tax that isn't in the total");
  await rejects(appConn.query("INSERT INTO expenses (company_id, site_id, expense_date, category, amount) VALUES (1, ?, '2026-01-01', 'fuel', 0)", [mainSite]),
    "database rejects zero/negative expenses");
  await rejects(appConn.query("INSERT INTO expenses (company_id, site_id, expense_date, category, amount) VALUES (1, ?, '2026-01-01', 'bribes', 10)", [mainSite]),
    "database rejects unknown expense types");

  // ── 4. Build and start the app against the test database
  console.log("▸ Building and starting the app");
  run(process.execPath, [`${root}/node_modules/next/dist/bin/next`, "build"], { NEXT_DIST_DIR: ".next-test" });
  const appPort = await freePort();
  const WEBHOOK_SECRET = "test-webhook-secret";
  if (process.env.KEEP_ON_FAIL || process.env.KEEP_SERVERS) console.log(`  app: http://localhost:${appPort}  db port: ${dbPort}`);
  // "localhost", not 127.0.0.1: Next.js rewrites 127.0.0.1 to localhost in redirects, which would drop cookies.
  const BASE = `http://localhost:${appPort}`;
  let app;
  const startApp = async () => {
    app = spawn(process.execPath, [`${root}/node_modules/next/dist/bin/next`, "start", "-p", String(appPort)], {
      cwd: root, env: { ...process.env, ...appEnv, NODE_ENV: "production", NEXT_DIST_DIR: ".next-test", HEALTH_DETAILS: "1", PLAN_PRICE_INR: "1000", RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET, SIGNUP_ENABLED: "1", CONTACT_PHONE: "919876543210", CONTACT_EMAIL: "hello@example.in" },
      stdio: ["ignore", fs.openSync(`${tmp}/app.log`, "a"), fs.openSync(`${tmp}/app.log`, "a")],
    });
    children.push(app);
    await waitFor(async () => { const r = await fetch(`${BASE}/api/health`); if (!r.ok) throw new Error(r.status); }, "App");
  };
  const stopApp = () => new Promise((resolve) => { app.once("exit", resolve); app.kill(); });
  await startApp();
  const health = await (await fetch(`${BASE}/api/health`)).json();
  check(health.status === "ok" && health.schema === "012_more_units.sql", "health check reports app + database up");
  const loginPage = await fetch(`${BASE}/login`);
  check(loginPage.headers.get("content-security-policy")?.includes("frame-ancestors 'none'") && loginPage.headers.get("x-content-type-options") === "nosniff"
    && loginPage.headers.get("strict-transport-security") && !loginPage.headers.get("x-powered-by"), "security headers are sent and the framework is not advertised");

  // ── 5. Browser flows
  const browser = await chromium.launch({ channel: "chrome" });
  const errors = [];
  const newPage = async (ctx) => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
    return p;
  };
  const firstCustomerId = ([rows]) => rows[0].id;
  const login = async (page, user, pw) => {
    await page.goto(`${BASE}/login`);
    await page.fill("#username", user);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(350);
    await page.fill("#password", pw);
    await page.keyboard.press("Enter");
  };

  // Pages stream in behind a loading skeleton, so wait for the content rather than reading the skeleton.
  const seen = (page, selector) => page.locator(selector).first().waitFor({ timeout: 3000 }).then(() => true, () => false);

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
    check(await seen(admin, '.shell[data-collapsed="true"]'), "collapsed sidebar is remembered after a reload");
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
    check(await seen(worker, ".calc >> text=₹15,000"), "booking total is auto-calculated");

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
    check(await seen(worker, ".calc >> text=₹8,500"), "balance = (delivered qty × rate) − paid");
    await worker.click("text=Complete delivery");
    await worker.waitForURL(/deliveries\?done=1/);
    const [[{ secondId }]] = await appConn.query("SELECT MAX(id) AS secondId FROM orders");
    check(!(await seen(worker, "td >> text=#1")) && (await seen(worker, `td >> text=#${secondId}`)), "completed order leaves the pending list");

    for (const p of ["/orders", "/customers", "/accounts", "/payroll", "/users", "/staff", "/activity", "/alerts", "/company"]) {
      await worker.goto(BASE + p);
      check(new URL(worker.url()).pathname === "/", `worker is kept out of ${p}`);
    }
    // The page streams (loading screen), so assert on what the worker sees rather than the status code.
    await worker.goto(`${BASE}/deliveries/1`);
    await worker.waitForSelector("text=Not found");
    check(!(await seen(worker, "text=MH12AB1234")) && !(await seen(worker, "text=Delivery details")),
      "worker cannot open a completed order");

    await worker.goto(`${BASE}/expenses`);
    await worker.selectOption('select[name="category"]', "fuel");
    await worker.fill('input[name="amount"]', "2400");
    await worker.click("text=Save expense");
    await worker.waitForSelector("text=Fuel expense of ₹2,400 saved");
    check(!(await seen(worker, "text=Expense report")), "worker can add expenses but not see the report");

    await worker.goto(`${BASE}/attendance`);
    check(!(await seen(worker, "text=Daily wage")), "worker never sees wages");
    await worker.click('label:has(input[value="present"]) >> nth=0');
    await worker.click('label:has(input[value="half_day"]) >> nth=1');
    await worker.click("text=Save attendance");
    await worker.waitForSelector("text=Attendance saved for 2 people");

    console.log("▸ Admin reports");
    await admin.goto(`${BASE}/customers`);
    check(await seen(admin, "td.due >> text=₹8,500"), "customer balance updated from the delivery");
    await admin.click("text=Shree Builders");
    await admin.fill('input[name="amount"]', "2000");
    await admin.click("text=Record payment");
    await admin.waitForSelector("text=Payment of ₹2,000 recorded");
    await admin.reload();
    check(await seen(admin, ".stat.accent >> text=₹6,500"), "later payment reduces the balance");
    await admin.goto(`${BASE}/accounts`);
    check(await seen(admin, ".stat.accent >> text=₹4,600"), "daily net cash = 5,000 + 2,000 − 2,400");
    await admin.goto(`${BASE}/payroll`);
    check(await seen(admin, "tfoot >> text=₹800"), "payroll = 500 (present) + 300 (half-day)");

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
    check(await seen(admin, "text=₹2,000 adv."), "reopening a delivery reverses the customer balance");
    await admin.goto(`${BASE}/activity`);
    check(await seen(admin, "text=Reopened delivery") && await seen(admin, "text=Completed delivery"), "activity log shows who did what");

    console.log("▸ Language & theme");
    const shot = (page, name) => process.env.SCREENSHOT_DIR && page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `${name}.png`), fullPage: true });
    await admin.goto(`${BASE}/`);
    check(await seen(admin, ".side-brand >> text=R.K. Enterprises"), "the app is called R.K. Enterprises");
    await admin.click('.apphead .pref-btn[lang="mr"]');
    await admin.waitForSelector("h1:has-text('आढावा')");
    check(await admin.evaluate(() => document.documentElement.lang) === "mr", "switching to Marathi translates the page and sets lang=mr");
    check(await seen(admin, ".side-brand >> text=आर.के. एंटरप्रायझेस"), "the name is spelled आर.के. एंटरप्रायझेस in Marathi");
    if (process.env.SCREENSHOT_DIR) {
      await admin.goto(`${BASE}/`);
      await shot(admin, "app-light");
    }
    await admin.goto(`${BASE}/staff`);
    await admin.click('.inset button:has-text("जतन करा")');
    await admin.waitForSelector("text=जतन केले.");
    check(true, "server messages arrive in Marathi");
    await shot(admin, "mr-light-staff");
    const theme = () => admin.evaluate(() => document.documentElement.dataset.theme);
    const before = await theme();
    await admin.click(".apphead .pref-icon");
    const after = await theme();
    await admin.goto(`${BASE}/customers`);
    check(before !== after && (await theme()) === after, "theme switch applies at once and is remembered");
    if (after !== "dark") await admin.click(".apphead .pref-icon");
    await shot(admin, "mr-dark-customers");
    await admin.goto(`${BASE}/activity`);
    check(await seen(admin, "text=वितरण पुन्हा उघडले"), "activity log entries are translated");
    await shot(admin, "mr-dark-activity");
    if (process.env.SCREENSHOT_DIR) {
      await admin.goto(`${BASE}/`);
      await shot(admin, "app-dark");
      const guest = await newPage(await browser.newContext());
      await guest.goto(`${BASE}/login`);
      await shot(guest, "login");
      await admin.goto(`${BASE}/activity`);
    }
    await admin.click('.apphead .pref-btn[lang="en"]');
    await admin.waitForSelector("h1:has-text('Activity log')");
    if ((await theme()) !== before) await admin.click(".apphead .pref-icon");
    check((await theme()) === before && await admin.evaluate(() => document.documentElement.lang) === "en", "switching back restores English");
    await worker.goto(`${BASE}/`);
    await worker.click('.topbar .pref-btn[lang="mr"]');
    await worker.waitForSelector("h1:has-text('आजचे')");
    await worker.goto(`${BASE}/orders/new`);
    check(await worker.evaluate(() => document.documentElement.scrollWidth) <= 390, "Marathi fits a phone screen without sideways scrolling");
    await shot(worker, "mr-phone-new-order");
    await worker.click('.topbar .pref-btn[lang="en"]');
    await worker.waitForSelector("h1:has-text('Book a new order')");

    console.log("▸ Quarry operations");
    const { parseWeight, stableReader } = await import(`${root}/src/lib/weight.mjs`);
    check(parseWeight("ST,GS,+00012340kg") === 12340 && parseWeight("+012.34 t") === 12340 && parseWeight("US,GS,+00012340kg") === null && parseWeight("") === null,
      "weighbridge output is parsed, and readings marked unstable are ignored");
    const steady = stableReader(3);
    check([100, 200, 200, 200].map(steady).at(-1) === 200 && steady(null) === null && steady(200) === null, "only a weight that holds steady is accepted");

    await admin.goto(`${BASE}/stock`);
    check(await seen(admin, "text=No materials yet"), "stock starts empty, with a clear next step");
    check(await admin.inputValue('select[name="unit"]') === "piece", "new items are counted in pieces unless you choose otherwise");
    const addMaterial = async (name, rate, opening, low) => {
      await admin.fill('input[name="name"]', name);
      await admin.selectOption('select[name="unit"]', "tonne");
      await admin.fill('input[name="default_rate"]', rate);
      await admin.fill('input[name="opening_stock"]', opening);
      await admin.fill('input[name="low_stock"]', low);
      await admin.click('button:has-text("Add material")');
      await admin.waitForSelector(`td >> text=${name}`);
    };
    await addMaterial("Grade-A Metal", "1500", "100", "50");
    await addMaterial("Boulder", "0", "500", "0");
    const stockOf = async (name) => Number((await appConn.query(
      `SELECT m.opening_stock + COALESCE((SELECT SUM(qty) FROM production_entries p WHERE p.material_id = m.id AND p.deleted_at IS NULL), 0)
         - COALESCE((SELECT SUM(input_qty) FROM production_entries p WHERE p.input_material_id = m.id AND p.deleted_at IS NULL), 0)
         - COALESCE((SELECT SUM(delivered_qty) FROM orders o WHERE o.material_id = m.id AND o.status = 'delivered'), 0)
         + COALESCE((SELECT SUM(difference) FROM stock_counts c WHERE c.material_id = m.id), 0) AS q
       FROM materials m WHERE m.name = ? AND m.company_id = 1`, [name]))[0][0].q);

    await worker.goto(`${BASE}/production`);
    await worker.selectOption('select[name="material_id"]', { label: "Grade-A Metal" });
    await worker.fill('input[name="qty"]', "60");
    await worker.selectOption('select[name="input_material_id"]', { label: "Boulder" });
    await worker.fill('input[name="input_qty"]', "70");
    await worker.click("text=Save production");
    check(await seen(worker, "text=Production saved"), "a worker can record production");
    await admin.goto(`${BASE}/stock`);
    check(await seen(admin, 'tr:has-text("Grade-A Metal") >> text=160 tonne') && await seen(admin, 'tr:has-text("Boulder") >> text=430 tonne'), "production adds to stock and uses up raw material");

    await worker.goto(`${BASE}/orders/new`);
    await worker.click('input[placeholder="Search by name or phone…"]');
    await worker.click(".picker-item >> text=Shree Builders");
    await worker.fill('input[name="ordered_qty"]', "1");
    await worker.fill('input[name="rate"]', "1");
    await worker.evaluate(() => document.querySelector('select[name="material_id"]').removeAttribute("required"));
    await worker.click("text=Book order");
    check(await seen(worker, "text=Choose a material"), "once materials exist, the server insists an order names one");
    await worker.selectOption('select[name="material_id"]', { label: "Grade-A Metal" });
    check(await worker.inputValue('input[name="rate"]') === "1500", "a material fills in its usual rate");
    await worker.fill('input[name="ordered_qty"]', "10");
    check(await seen(worker, "text=Available: 160 tonne"), "available stock shows while booking");
    await worker.click("text=Book order");
    await worker.waitForSelector("text=booked for Shree Builders");
    const [[{ opId }]] = await appConn.query("SELECT MAX(id) AS opId FROM orders");
    await admin.goto(`${BASE}/stock`);
    check(await seen(admin, 'tr:has-text("Grade-A Metal") >> text=150'), "a booked order reserves stock without removing it");

    await worker.goto(`${BASE}/deliveries/${opId}`);
    await worker.fill('input[name="vehicle_number"]', "mh 14 xy 9999");
    await worker.fill('input[name="tare_kg"]', "8000");
    await worker.click("text=Save arrival");
    check(await seen(worker, "text=is at the gate"), "the first weighing can be saved on its own");
    await worker.goto(`${BASE}/deliveries`);
    check(await seen(worker, "text=At gate: MH 14 XY 9999"), "the pending list shows which truck is at the gate");
    await worker.goto(`${BASE}/deliveries/${opId}`);
    await worker.waitForSelector('input[name="gross_kg"]');
    check(await worker.inputValue('input[name="vehicle_number"]') === "MH 14 XY 9999" && await worker.inputValue('input[name="tare_kg"]') === "8000", "the next person carries on from the first weighing");
    await worker.fill('input[name="gross_kg"]', "7000");
    await worker.click("text=Complete delivery");
    check(await seen(worker, "text=Loaded weight must be more"), "a loaded weight below the empty weight is refused");
    await worker.fill('input[name="gross_kg"]', "18250");
    check(await seen(worker, ".net-line >> text=10,250 kg") && await worker.inputValue('input[name="delivered_qty"]') === "10.25", "net weight and delivered quantity work themselves out");
    await worker.fill('input[name="pass_no"]', "ETP-123");
    await worker.fill('input[name="paid_amount"]', "1000");
    await worker.click("text=Complete delivery");
    await worker.waitForURL(/deliveries\?done=/);
    check(await stockOf("Grade-A Metal") === 149.75, "a delivery takes its real weight out of stock");
    const [[weighed]] = await appConn.query("SELECT gross_kg, tare_kg, net_kg, pass_no, vehicle_id FROM orders WHERE id = ?", [opId]);
    const [[remembered]] = await appConn.query("SELECT tare_kg FROM vehicles WHERE id = ?", [weighed.vehicle_id]);
    check(Number(weighed.net_kg) === 10250 && Number(remembered.tare_kg) === 8000, "weights are stored and the truck is remembered with its empty weight");
    await worker.click("text=Print challan");
    await worker.waitForSelector(".challan");
    const slip = await worker.textContent(".challan");
    check(slip.includes("10,250 kg") && slip.includes("ETP-123") && slip.includes("Shree Builders") && !slip.includes("₹"), "the challan carries the weights and pass, and no prices");

    // A simulated indicator: unstable lines first, then the truck settles.
    const scaleCtx = await browser.newContext();
    await scaleCtx.addInitScript(() => {
      const lines = ["US,GS,+00018100kg", "ST,GS,+00018240kg", "ST,GS,+00018000kg", "ST,GS,+00018000kg", "ST,GS,+00018000kg", "ST,GS,+00018000kg", "ST,GS,+00018000kg"];
      const encoder = new TextEncoder();
      const port = {
        open: async () => {},
        close: async () => {},
        get readable() {
          let i = 0;
          return { getReader: () => ({ read: async () => (i < lines.length ? { value: encoder.encode(`${lines[i++]}\r\n`), done: false } : { done: true }), cancel: async () => {}, releaseLock() {} }) };
        },
      };
      Object.defineProperty(navigator, "serial", { value: { requestPort: async () => port } });
    });
    const scalePage = await newPage(scaleCtx);
    await login(scalePage, "admin", ADMIN_PW);
    await scalePage.waitForSelector(".side-brand");
    await scalePage.goto(`${BASE}/orders/new`);
    await scalePage.click('input[placeholder="Search by name or phone…"]');
    await scalePage.click(".picker-item >> text=Shree Builders");
    await scalePage.selectOption('select[name="material_id"]', { label: "Grade-A Metal" });
    await scalePage.fill('input[name="ordered_qty"]', "5");
    await scalePage.click("text=Book order");
    await scalePage.waitForSelector("text=booked for Shree Builders");
    const [[{ scaleId }]] = await appConn.query("SELECT MAX(id) AS scaleId FROM orders");
    await scalePage.goto(`${BASE}/deliveries/${scaleId}`);
    await scalePage.fill('input[name="vehicle_number"]', "MH 14 XY 9999");
    check(await scalePage.inputValue('input[name="tare_kg"]') === "8000", "a known truck's empty weight fills itself in");
    await scalePage.locator('button:has-text("Read weighbridge")').nth(1).click();
    await scalePage.waitForFunction(() => document.querySelector('input[name="gross_kg"]').value === "18000", null, { timeout: 5000 }).catch(() => {});
    check(await scalePage.inputValue('input[name="gross_kg"]') === "18000", "the weighbridge is read directly, and only once the weight is steady");
    await scalePage.waitForFunction(() => document.querySelector('input[name="delivered_qty"]').value === "10", null, { timeout: 3000 }).catch(() => {});
    check(await scalePage.inputValue('input[name="delivered_qty"]') === "10", "…and the reading flows through to the delivered quantity");
    await scalePage.click("text=Complete delivery");
    await scalePage.waitForURL(/deliveries\?done=/);
    check(await stockOf("Grade-A Metal") === 139.75, "a second load comes out of stock");
    scalePage.once("dialog", (d) => d.accept());
    await scalePage.goto(`${BASE}/deliveries/${scaleId}`);
    await scalePage.click("text=Reopen delivery");
    await scalePage.waitForSelector('input[name="gross_kg"]');
    check(await stockOf("Grade-A Metal") === 149.75, "reopening a delivery puts its material back in stock");
    await scaleCtx.close();

    await worker.goto(`${BASE}/vehicles`);
    await worker.selectOption('form:has(input[name="litres"]) select[name="vehicle_id"]', { label: "MH 14 XY 9999" });
    await worker.fill('input[name="litres"]', "50");
    await worker.fill('form:has(input[name="litres"]) input[name="amount"]', "4750");
    await worker.click("text=Save fuel");
    check(await seen(worker, "text=Fuel for MH 14 XY 9999 saved"), "fuel can be recorded against a vehicle");
    const [[fuelExpense]] = await appConn.query("SELECT e.id, e.category, e.amount FROM fuel_logs f JOIN expenses e ON e.id = f.expense_id ORDER BY f.id DESC LIMIT 1");
    check(fuelExpense.category === "fuel" && Number(fuelExpense.amount) === 4750, "fuel is added to expenses automatically");
    await admin.goto(`${BASE}/expenses`);
    admin.once("dialog", (d) => d.accept());
    await admin.click('tr:has-text("MH 14 XY 9999") button');
    await admin.waitForSelector('tr:has-text("MH 14 XY 9999")', { state: "detached" });
    const [[{ fuelGone }]] = await appConn.query("SELECT deleted_at IS NOT NULL AS fuelGone FROM fuel_logs ORDER BY id DESC LIMIT 1");
    check(fuelGone === 1, "deleting the expense removes its fuel record too");

    // Set up one of every exception, then check each is flagged.
    await rootConn.query(`UPDATE ${DB}.orders SET booked_at = NOW() - INTERVAL 5 DAY WHERE id = ?`, [scaleId]);
    await rootConn.query(`UPDATE ${DB}.orders SET delivered_at = delivered_at - INTERVAL 40 DAY WHERE status = 'delivered' AND balance_amount > 0`);
    await rootConn.query(`UPDATE ${DB}.customer_payments SET paid_on = paid_on - INTERVAL 40 DAY`);
    for (const amount of [100, 110, 120, 130, 140]) await rootConn.query(`INSERT INTO ${DB}.expenses (company_id, site_id, expense_date, category, amount) VALUES (1, ${mainSite}, CURDATE() - INTERVAL 20 DAY, 'other', ?)`, [amount]);
    await rootConn.query(`INSERT INTO ${DB}.expenses (company_id, site_id, expense_date, category, amount) VALUES (1, ${mainSite}, CURDATE(), 'other', 9000)`);
    const [[{ matId }]] = await appConn.query("SELECT id AS matId FROM materials WHERE name = 'Grade-A Metal'");
    await admin.goto(`${BASE}/customers/${firstCustomerId(await appConn.query("SELECT id FROM customers WHERE name = 'Shree Builders'"))}`);
    await admin.fill('input[name="credit_limit"]', "100");
    await admin.click("text=Save details");
    await admin.waitForSelector("text=Details saved");
    await admin.goto(`${BASE}/stock/${matId}`);
    await admin.fill('input[name="low_stock"]', "200");
    await admin.click('form:has(input[name="low_stock"]) button:has-text("Save")');
    await admin.waitForSelector("text=Saved.");
    await admin.fill('input[name="counted_qty"]', "140");
    await admin.click("text=Save count");
    await admin.waitForSelector("text=Count saved");
    check(await stockOf("Grade-A Metal") === 140, "a physical count corrects the book figure");
    const [[counted]] = await appConn.query("SELECT book_qty, difference FROM stock_counts ORDER BY id DESC LIMIT 1");
    check(Number(counted.book_qty) === 149.75 && Number(counted.difference) === -9.75, "…and keeps the difference on record");
    await admin.goto(`${BASE}/vehicles`);
    await admin.selectOption('form:has(input[name="description"]) select[name="vehicle_id"]', { label: "MH 14 XY 9999" });
    await admin.fill('input[name="description"]', "Clutch plate");
    await admin.fill('form:has(input[name="description"]) input[name="amount"]', "12000");
    await admin.fill('input[name="next_due"]', "2020-01-01");
    await admin.click("text=Save work");
    await admin.waitForSelector("text=Work on MH 14 XY 9999 saved");
    await admin.goto(`${BASE}/alerts`);
    await admin.waitForSelector(".alert-list");
    const flagged = await admin.textContent(".alert-list");
    for (const [label, text] of [["Low stock", "low stock"], ["Count difference", "a stock count gap above 2%"], ["Delivery delay", "a delivery delay"], ["Over credit limit", "a crossed credit limit"], ["Overdue payment", "an overdue balance"], ["Unusual expense", "an unusual expense"], ["Service due", "a service due"]]) {
      check(flagged.includes(label), `${text} is flagged`);
    }
    await admin.goto(`${BASE}/`);
    check(await seen(admin, ".alert-list"), "the owner's dashboard shows what needs attention");

    const csv = await (await adminCtx.request.get(`${BASE}/api/export/orders`)).text();
    check(csv.includes("Gross kg") && csv.includes("ETP-123") && csv.includes("Grade-A Metal"), "orders download as a CSV file");
    check((await fetch(`${BASE}/api/export/orders`, { redirect: "manual" })).status === 307, "the export needs a login");
    check(new URL((await workerCtx.request.get(`${BASE}/api/export/orders`)).url()).pathname === "/", "the export is for the owner only");
    await worker.setViewportSize({ width: 390, height: 844 });
    for (const p of ["/production", "/stock", "/vehicles"]) {
      await worker.goto(BASE + p);
      await worker.waitForLoadState("networkidle");
      check(await worker.evaluate(() => document.documentElement.scrollWidth) <= 390, `${p} fits a phone screen`);
    }

    if (process.env.SCREENSHOT_DIR) {
      const snap = async (page, url, name, sel = ".page-head") => { await page.goto(BASE + url); await page.waitForSelector(sel); await page.waitForLoadState("networkidle"); await page.waitForTimeout(700); await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `${name}.png`), fullPage: true }); };
      await snap(admin, "/", "ops-dashboard");
      await snap(admin, "/stock", "ops-stock");
      await snap(admin, `/stock/${matId}`, "ops-material");
      await snap(admin, "/alerts", "ops-alerts");
      await snap(admin, "/vehicles", "ops-vehicles");
      await snap(admin, "/production", "ops-production");
      await snap(worker, `/deliveries/${scaleId}`, "ops-phone-delivery");
      await snap(worker, "/stock", "ops-phone-stock");
      await snap(worker, `/deliveries/${opId}/challan`, "ops-phone-challan", ".challan");
      await snap(admin, `/deliveries/${opId}/challan`, "ops-challan", ".challan");
    }
    for (const p of ["/", "/stock", "/alerts", "/vehicles", "/production"]) {
      const started = performance.now();
      await adminCtx.request.get(BASE + p);
      console.log(`  · ${p} ${Math.round(performance.now() - started)} ms`);
    }


    console.log("▸ GST invoices");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    const [[{ metalId }]] = await appConn.query("SELECT id AS metalId FROM materials WHERE name = 'Grade-A Metal' AND company_id = 1");
    const orderFor = async (customerId, qty, rate, { material = metalId, site = mainSite } = {}) => {
      const [res] = await appConn.query(
        "INSERT INTO orders (company_id, site_id, customer_id, material_id, ordered_qty, rate, total_amount, booked_by) VALUES (1, ?, ?, ?, ?, ?, ROUND(? * ?, 2), 1)",
        [site, customerId, material, qty, rate, qty, rate],
      );
      return res.insertId;
    };
    const deliver = async (page, id, { vehicle = "MH 12 GS 1000", paid = "", mode = "cash", pass = "", error } = {}) => {
      await page.goto(`${BASE}/deliveries/${id}`);
      await page.fill('input[name="vehicle_number"]', vehicle);
      if (paid) await page.fill('input[name="paid_amount"]', paid);
      await page.selectOption('select[name="paid_mode"]', mode);
      if (pass) await page.fill('input[name="pass_no"]', pass);
      await page.click("text=Complete delivery");
      if (error) return seen(page, `.alert-error:has-text("${error}")`);
      await page.waitForURL(/deliveries\?done=/);
      return true;
    };
    const saveCompanyForm = async (message = "Saved.") => {
      await admin.click('form:has(input[name="gst_enabled"]) button:has-text("Save")');
      return seen(admin, `.alert:has-text("${message}")`);
    };
    const invoiceOf = async (orderId) => (await appConn.query("SELECT * FROM invoices WHERE order_id = ? ORDER BY id DESC LIMIT 1", [orderId]))[0][0];
    const customerNamed = async (name, gstin = null, state = null) => {
      const [res] = await appConn.query("INSERT INTO customers (company_id, name, gstin, state_code) VALUES (1, ?, ?, ?)", [name, gstin, state]);
      return res.insertId;
    };

    await admin.goto(`${BASE}/company`);
    await admin.fill('input[name="address"]', "Gat 12, Quarry Road");
    await admin.fill('input[name="place"]', "Pune");
    await admin.fill('input[name="pincode"]', "411001");
    await admin.fill('input[name="invoice_prefix"]', "rk");
    await admin.fill('form:has(input[name="gst_enabled"]) input[name="gstin"]', "");
    await admin.check('input[name="gst_enabled"]');
    check(await saveCompanyForm("Add a valid GSTIN"), "GST can't be switched on without a GSTIN");
    await admin.fill('form:has(input[name="gst_enabled"]) input[name="gstin"]', "27AAPFU0939F1ZA");
    check(await saveCompanyForm("valid 15-character GSTIN"), "a mistyped GSTIN is caught by its check digit");
    await admin.fill('form:has(input[name="gst_enabled"]) input[name="gstin"]', "27AAPFU0939F1ZV");
    check(await saveCompanyForm(), "a valid GSTIN and address switch GST on");

    const local = await customerNamed("Sahyadri Builders", "27AABCS1429B1Z1", "27");
    await admin.goto(`${BASE}/customers/${local}`);
    await admin.fill('form:has(input[name="credit_limit"]) input[name="gstin"]', "27AAPFU0939F1ZA");
    await admin.click("text=Save details");
    check(await seen(admin, '.alert-error:has-text("valid 15-character GSTIN")'), "a customer's mistyped GSTIN is refused too");
    await appConn.query("UPDATE customers SET gstin = '27AAPFU0939F1ZV', address = '5 MG Road', place = 'Pune', pincode = '411002' WHERE id = ?", [local]);

    const firstBill = await orderFor(local, 10, 1000);
    await admin.goto(`${BASE}/deliveries/${firstBill}`);
    await admin.fill('input[name="vehicle_number"]', "MH 12 GS 1000");
    check((await admin.locator(".calc").innerText()).includes("10,500"), "the delivery form shows the total with GST before saving");
    await deliver(admin, firstBill, { paid: "500" });
    check(/invoice=\d+/.test(admin.url()) && await seen(admin, "text=Print invoice"), "completing a delivery issues an invoice and offers it to print");
    let inv = await invoiceOf(firstBill);
    check(/^RK\/\d\d-\d\d\/00001$/.test(inv.number) && inv.number.length <= 16, "invoice numbers start at 1 for the year and stay within 16 characters");
    check(Number(inv.taxable_value) === 10000 && Number(inv.cgst) === 250 && Number(inv.sgst) === 250 && Number(inv.igst) === 0 && Number(inv.total) === 10500, "a sale within the State splits into CGST and SGST");
    const [[billed]] = await appConn.query("SELECT total_amount, tax_amount, balance_amount FROM orders WHERE id = ?", [firstBill]);
    check(Number(billed.total_amount) === 10500 && Number(billed.tax_amount) === 500 && Number(billed.balance_amount) === 10000, "the customer owes the amount including GST, less what they paid");

    await admin.goto(`${BASE}/deliveries/${firstBill}`);
    const track = admin.locator(".order-progress li");
    check(await track.count() === 6 && await admin.locator('.order-progress li[data-state="done"]').count() === 5, "an order shows how far it has got, booking to payment");
    check((await track.last().innerText()).includes("₹10,000 due"), "…and what's still owed on it");
    const justBooked = await orderFor(local, 1, 1000);
    await admin.goto(`${BASE}/deliveries/${justBooked}`);
    check(await admin.locator('.order-progress li[data-state="done"]').count() === 1 && await admin.locator('.order-progress li[aria-current="step"]').innerText().then((x) => x.includes("At the gate")), "a new order is waiting at its first step");
    await appConn.query("UPDATE orders SET status = 'cancelled' WHERE id = ?", [justBooked]);

    await admin.goto(`${BASE}/invoices/${inv.id}`);
    const printed = await admin.locator(".invoice").innerText();
    check(["TAX INVOICE", "27AAPFU0939F1ZV", "2517", "CGST @ 2.5%", "SGST @ 2.5%", "Maharashtra (27)", "Rupees Ten Thousand Five Hundred Only", "Reverse charge"].every((x) => printed.includes(x)), "the printed invoice carries what a tax invoice must show");

    const farAway = await customerNamed("Bengaluru Infra", "29AAGCB7383J1Z4", "29");
    const interBill = await orderFor(farAway, 100, 600);
    await deliver(admin, interBill);
    const inter = await invoiceOf(interBill);
    check(Number(inter.igst) === 3000 && Number(inter.cgst) === 0 && inter.place_of_supply === "29", "a sale to another State is charged IGST instead");
    await appConn.query("UPDATE customers SET name = 'Renamed Later', gstin = NULL WHERE id = ?", [farAway]);
    await admin.goto(`${BASE}/invoices/${inter.id}`);
    check((await admin.locator(".invoice").innerText()).includes("Bengaluru Infra"), "changing a customer later doesn't rewrite an issued invoice");

    await admin.goto(`${BASE}/company`);
    await admin.check('input[name="rates_include_gst"]');
    await saveCompanyForm();
    const inclusive = await orderFor(local, 1, 1050);
    await deliver(admin, inclusive);
    const incl = await invoiceOf(inclusive);
    check(Number(incl.total) === 1050 && Number(incl.taxable_value) === 1000 && Number(incl.cgst) === 25, "with inclusive rates the tax comes out of the price, not on top");
    await admin.goto(`${BASE}/company`);
    await admin.uncheck('input[name="rates_include_gst"]');
    await saveCompanyForm();

    await rejects(appConn.query(
      `INSERT INTO invoices (company_id, site_id, order_id, customer_id, number, fy, invoice_date, supplier_name, supplier_gstin, buyer_name, place_of_supply, item_name, hsn_code, qty, unit, uqc, rate, taxable_value, gst_rate, cgst, sgst, total)
       VALUES (1, ?, ?, ?, 'X/1', '2026-27', '2026-10-01', 'A', '27AAPFU0939F1ZV', 'B', '27', 'C', '2517', 1, 't', 'MTS', 100, 100, 5, 2.5, 2.5, 999)`, [mainSite, firstBill, local]),
      "database rejects an invoice whose total doesn't add up");
    await rejects(appConn.query("UPDATE invoices SET sgst = sgst + 1, total = total + 1 WHERE id = ?", [inv.id]), "database rejects unequal CGST and SGST");
    await rejects(appConn.query("DELETE FROM invoices WHERE id = ?", [inv.id]), "app login can't delete an invoice");

    const redo = await orderFor(local, 2, 1000);
    await deliver(admin, redo);
    const firstCopy = await invoiceOf(redo);
    admin.once("dialog", (d) => d.accept());
    await admin.goto(`${BASE}/deliveries/${redo}`);
    check((await admin.locator("body").innerText()).includes(`Invoice ${firstCopy.number} will be cancelled`), "reopening warns which invoice will be cancelled");
    await admin.click("text=Reopen delivery");
    await admin.waitForSelector('input[name="vehicle_number"]');
    const voided = await invoiceOf(redo);
    check(voided.status === "cancelled" && voided.number === firstCopy.number, "reopening a delivery cancels its invoice but keeps the number");
    const [[reopened]] = await appConn.query("SELECT total_amount, tax_amount FROM orders WHERE id = ?", [redo]);
    check(Number(reopened.total_amount) === 2000 && Number(reopened.tax_amount) === 0, "…and the order goes back to its plain booking value");
    await deliver(admin, redo);
    const again = await invoiceOf(redo);
    check(again.number !== firstCopy.number && Number(again.number.slice(-5)) === Number(firstCopy.number.slice(-5)) + 1, "delivering it again takes the next number, leaving no gap");

    const month = today.slice(0, 7);
    await admin.goto(`${BASE}/gst?month=${month}`);
    check(await seen(admin, ".stat:has-text('IGST')"), "the GST page totals the month");
    const sheet = async (kind) => (await adminCtx.request.get(`${BASE}/api/export/gst?month=${month}&kind=${kind}`)).text();
    const b2b = await sheet("b2b");
    check(b2b.includes("27AAPFU0939F1ZV") && b2b.includes(inv.number), "registered buyers are listed invoice by invoice");
    const docs = await sheet("docs");
    check(docs.includes(",1,") || /,1\r?\n/.test(docs), "cancelled numbers are counted on the documents sheet");
    check((await sheet("hsn")).includes("2517"), "sales are summarised by HSN code");
    check((await adminCtx.request.get(`${BASE}/api/export/gst?month=bad&kind=hsn`)).status() === 400, "a malformed month is refused");

    console.log("▸ E-way bills");
    const heavy = await orderFor(local, 100, 1000);
    await deliver(admin, heavy, { vehicle: "MH 12 EW 7788" });
    const bill = await invoiceOf(heavy);
    await admin.goto(`${BASE}/invoices/${bill.id}`);
    check(await seen(admin, "text=needs an e-way bill"), "a load over the limit is marked as needing an e-way bill");
    await appConn.query("UPDATE invoices SET buyer_pincode = NULL, buyer_place = NULL WHERE id = ?", [bill.id]);
    await admin.reload();
    check(await seen(admin, "text=Still needed for the portal"), "the page says what's missing before a file can be made");
    check((await adminCtx.request.get(`${BASE}/api/export/ewaybill?id=${bill.id}`)).status() === 404, "an incomplete invoice gets no file");
    await admin.fill('input[name="buyer_place"]', "Pune");
    await admin.fill('input[name="buyer_pincode"]', "12");
    await admin.fill('input[name="distance_km"]', "35");
    await admin.click('form:has(input[name="distance_km"]) button:has-text("Save")');
    check(await seen(admin, ".alert-error:has-text('6-digit pincode')"), "a bad pincode is refused");
    await admin.fill('input[name="buyer_pincode"]', "411002");
    await admin.click('form:has(input[name="distance_km"]) button:has-text("Save")');
    await admin.waitForSelector('.alert-ok:has-text("Saved.")');
    const ewayFile = await (await adminCtx.request.get(`${BASE}/api/export/ewaybill?id=${bill.id}`)).json();
    const ew = ewayFile.billLists[0];
    check(ewayFile.version && ew.userGstin === "27AAPFU0939F1ZV" && ew.supplyType === "O" && ew.subSupplyType === 1 && ew.docType === "INV" && ew.transType === 1, "the file uses the portal's upload format");
    check(/^\d\d\/\d\d\/\d{4}$/.test(ew.docDate) && ew.vehicleNo === "MH12EW7788" && ew.transDistance === 35 && ew.fromPincode === 411001 && ew.toPincode === 411002, "dates, vehicle and pincodes are in the form the portal expects");
    check("actualFromStateCode" in ew && "actualToStateCode" in ew && "OthValue" in ew && "TotNonAdvolVal" in ew && !("actFromStateCode" in ew), "field names match the upload format, not the API's");
    check(ew.totInvValue === 105000 && ew.cgstValue === 2500 && ew.itemList[0].hsnCode === 2517 && ew.itemList[0].qtyUnit === "MTS" && ew.itemList[0].cgstRate === 2.5, "the amounts and item line match the invoice");
    await admin.reload();
    await admin.fill('input[name="ewb_no"]', "12345");
    await admin.click("text=Save e-way bill");
    check(await seen(admin, ".alert-error:has-text('12 digits')"), "an e-way bill number must have 12 digits");
    await admin.goto(`${BASE}/alerts`);
    check(await seen(admin, `text=Invoice ${bill.number}`), "a load with no e-way bill number is flagged");
    await admin.goto(`${BASE}/invoices/${bill.id}`);
    await admin.fill('input[name="ewb_no"]', "351234567890");
    await admin.click("text=Save e-way bill");
    await admin.waitForSelector('.alert-ok:has-text("Saved.")');
    await admin.reload();
    check((await admin.locator(".invoice").innerText()).includes("351234567890"), "the e-way bill number prints on the invoice");

    console.log("▸ Sites");
    check(await admin.locator(".side-site").count() === 0, "a company with one site never sees a site chooser");
    await admin.goto(`${BASE}/sites`);
    await admin.fill('form:has(button:has-text("Add site")) input[name="name"]', "Hill Site");
    await admin.fill('form:has(button:has-text("Add site")) input[name="place"]', "Wai");
    await admin.click('button:has-text("Add site")');
    await admin.waitForSelector(".alert-ok:has-text('Added Hill Site')");
    const [[{ hill }]] = await appConn.query("SELECT id AS hill FROM sites WHERE name = 'Hill Site'");
    await admin.goto(`${BASE}/stock`);
    await admin.waitForSelector(".side-site select");
    await admin.selectOption(".side-site select", { label: "Hill Site" });
    await admin.waitForFunction(() => document.cookie.includes("rq_site="), null, { timeout: 5000 });
    await admin.goto(`${BASE}/stock`);
    const stockRow = () => admin.locator('tr:has-text("Grade-A Metal") td').nth(1).innerText();
    check((await stockRow()).startsWith("0 "), "a new site starts with no stock of its own");
    await admin.goto(`${BASE}/production`);
    await admin.selectOption('select[name="material_id"]', { label: "Grade-A Metal" });
    await admin.fill('input[name="qty"]', "40");
    await admin.click("text=Save production");
    await admin.waitForSelector(".alert-ok");
    await admin.goto(`${BASE}/stock`);
    check((await stockRow()).startsWith("40 "), "production at a site adds to that site's stock");
    const [[hillMade]] = await appConn.query("SELECT site_id FROM production_entries ORDER BY id DESC LIMIT 1");
    check(hillMade.site_id === hill, "records are stamped with the site they were made at");
    const hillCustomer = await customerNamed("Wai Contractors");
    const hillOrder = await orderFor(hillCustomer, 5, 1000, { site: hill });
    await admin.goto(`${BASE}/deliveries`);
    check(await seen(admin, "text=Wai Contractors"), "a site's deliveries list shows its own orders");
    await admin.selectOption(".side-site select", { label: "Main site" });
    await admin.waitForFunction(() => !document.body.innerText.includes("Wai Contractors"), null, { timeout: 5000 }).catch(() => {});
    await admin.goto(`${BASE}/deliveries`);
    await admin.waitForSelector("h1:has-text('Deliveries')");
    check(!(await admin.locator("body").innerText()).includes("Wai Contractors"), "…and the other site's list doesn't");
    await deliver(admin, hillOrder, { paid: "1000" });
    await admin.goto(`${BASE}/sites`);
    const compare = await admin.locator('section:has(h2:has-text("Side by side")), .card:has-text("Side by side")').first().innerText();
    check(compare.includes("Hill Site") && compare.includes("Main site"), "the sites page compares sites side by side");
    check(await seen(admin, 'tr:has-text("Hill Site") td:has-text("₹5,250")'), "each site shows its own sales");
    await admin.goto(`${BASE}/users`);
    const pinForm = admin.locator('tr:has-text("ramesh") form:has(select[name="site_id"])');
    await pinForm.locator("select").selectOption({ label: "Main site" });
    await pinForm.locator("button").click();
    await seen(admin, ".alert-ok:has-text('Saved.')");
    await workerCtx.addCookies([{ name: "rq_site", value: String(hill), url: BASE }]);
    await worker.goto(`${BASE}/deliveries`);
    await worker.waitForSelector("h1:has-text('Deliveries')");
    check(!(await worker.locator("body").innerText()).includes("Wai Contractors"), "a login pinned to a site can't reach another by changing a cookie");
    const [foreign] = await rootConn.query(`INSERT INTO ${DB}.companies (name) VALUES ('Rival Quarries')`);
    const [foreignSite] = await rootConn.query(`INSERT INTO ${DB}.sites (company_id, name) VALUES (?, 'Rival Pit')`, [foreign.insertId]);
    await adminCtx.addCookies([{ name: "rq_site", value: String(foreignSite.insertId), url: BASE }]);
    await admin.goto(`${BASE}/cash`);
    check(await seen(admin, '.page-eyebrow:has-text("Main site")'), "another company's site can't be chosen by forging a cookie");
    await admin.goto(`${BASE}/sites`);
    await admin.locator("details.site-edit").nth(1).locator("summary").click();
    await admin.locator("details.site-edit").nth(0).locator("summary").click();
    await admin.locator("details.site-edit").nth(0).locator('input[name="active"]').uncheck();
    await admin.locator("details.site-edit").nth(0).locator("button").click();
    await seen(admin, ".alert-ok");
    await admin.reload();
    await admin.locator("details.site-edit").nth(0).locator("summary").click();
    const lastSite = admin.locator("details.site-edit").nth(0);
    await lastSite.locator('input[name="active"]').uncheck();
    await lastSite.locator("button").click();
    check(await seen(admin, ".alert-error:has-text('at least one active site')"), "the last active site can't be switched off");
    await admin.reload();
    const sleeping = admin.locator("details.site-edit").last();
    await sleeping.locator("summary").click();
    await sleeping.locator('input[name="active"]').check();
    await sleeping.locator("button").click();
    await waitFor(async () => {
      const [[{ asleep }]] = await appConn.query("SELECT COUNT(*) AS asleep FROM sites WHERE company_id = 1 AND active = 0");
      if (asleep) throw new Error("site still inactive");
    }, "Site reactivation", 5000);
    await rootConn.query(`UPDATE ${DB}.companies SET gst_enabled = 0 WHERE id = 1`);

    console.log("▸ Daily cash");
    await adminCtx.addCookies([{ name: "rq_site", value: String(hill), url: BASE }]);
    const yesterday = new Date(`${today}T00:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const dayBefore = yesterday.toISOString().slice(0, 10);
    await admin.goto(`${BASE}/cash?date=${dayBefore}`);
    await admin.fill('input[name="opening"]', "5000");
    await admin.fill('input[name="counted"]', "5000");
    await admin.click("button:has-text('Close the day')");
    check(await seen(admin, ".alert-ok:has-text('matches exactly')"), "the first count starts from an opening amount");

    const cashOrder = await orderFor(hillCustomer, 2, 1000, { site: hill });
    const upiOrder = await orderFor(hillCustomer, 3, 1000, { site: hill });
    await deliver(admin, cashOrder, { paid: "2000", mode: "cash" });
    await deliver(admin, upiOrder, { paid: "3000", mode: "upi" });
    await admin.goto(`${BASE}/customers/${hillCustomer}`);
    await admin.fill('form:has(input[name="paid_on"]) input[name="amount"]', "700");
    await admin.selectOption('select[name="mode"]', "cash");
    await admin.click("text=Record payment >> nth=-1");
    await admin.waitForSelector(".alert-ok");
    await admin.fill('form:has(input[name="paid_on"]) input[name="amount"]', "900");
    await admin.selectOption('select[name="mode"]', "bank");
    await admin.click("text=Record payment >> nth=-1");
    await admin.waitForFunction(() => document.querySelectorAll(".alert-ok").length > 0);
    await admin.goto(`${BASE}/expenses`);
    for (const [amount, from] of [["300", "cash"], ["4000", "bank"]]) {
      await admin.selectOption('select[name="category"]', "other");
      await admin.fill('form:has(select[name="paid_from"]) input[name="amount"]', amount);
      await admin.selectOption('select[name="paid_from"]', from);
      await admin.click("text=Save expense");
      await admin.waitForSelector(`.alert-ok:has-text("₹${from === "cash" ? "300" : "4,000"}")`);
    }
    await admin.goto(`${BASE}/cash`);
    const expectedStat = () => admin.locator('.stat:has-text("Should be in the box") .value').innerText();
    // 5,000 opening + 1,000 and 2,000 at delivery + 700 dues − 300 expense. UPI, bank money and the bank expense stay out.
    const expectedNow = await expectedStat();
    check(expectedNow.includes("8,400"), `only cash counts: opening + cash sales + cash dues − cash expenses (${expectedNow})`);
    await admin.fill('input[name="deposited"]', "2000");
    await admin.fill('input[name="counted"]', "6300");
    await admin.evaluate(() => document.querySelector('input[name="note"]').removeAttribute("required"));
    await admin.click("button:has-text('Close the day')");
    check(await seen(admin, ".alert-error:has-text('explaining the difference')"), "a count that doesn't match needs an explanation");
    await admin.fill('input[name="note"]', "Short by a hundred, checking");
    await admin.click("button:has-text('Close the day')");
    check(await seen(admin, ".alert-ok:has-text('₹100 short')"), "a short count is reported to the rupee");
    const [[closed]] = await appConn.query("SELECT * FROM cash_closings WHERE site_id = ? AND close_date = ?", [hill, today]);
    check(Number(closed.opening) === 5000 && Number(closed.cash_sales) === 3000 && Number(closed.cash_received) === 700 && Number(closed.cash_expenses) === 300
      && Number(closed.deposited) === 2000 && Number(closed.expected) === 6400 && Number(closed.counted) === 6300 && Number(closed.difference) === -100, "the closing keeps every figure as it stood");
    await rejects(appConn.query("UPDATE cash_closings SET difference = 0 WHERE id = ?", [closed.id]), "database rejects a closing whose difference doesn't add up");
    await admin.goto(`${BASE}/alerts`);
    check(await seen(admin, "text=₹100 short"), "a short day is flagged on Needs attention");
    await admin.goto(`${BASE}/expenses`);
    await admin.selectOption('select[name="category"]', "other");
    await admin.fill('form:has(select[name="paid_from"]) input[name="amount"]', "50");
    await admin.click("text=Save expense");
    await admin.waitForSelector('.alert-ok:has-text("₹50")');
    await admin.goto(`${BASE}/cash`);
    check(await seen(admin, ".alert-error:has-text('changed by ₹50')"), "a record added after the count shows up, instead of quietly changing the closing");
    await admin.goto(`${BASE}/cash?date=${dayBefore}`);
    check(await seen(admin, "text=A later day is already closed"), "an earlier closing is locked once a later day is closed");

    console.log("▸ Royalty");
    await appConn.query("UPDATE materials SET royalty_per_unit = 60 WHERE id = ?", [metalId]);
    await adminCtx.addCookies([{ name: "rq_site", value: String(mainSite), url: BASE }]);
    await admin.goto(`${BASE}/company`);
    await admin.check('input[name="pass_required"]');
    await admin.uncheck('input[name="gst_enabled"]');
    await saveCompanyForm();
    const noPass = await orderFor(local, 5, 1000);
    check(await deliver(admin, noPass, { error: "royalty pass number" }), "with passes required, a royalty load can't leave without one");
    await deliver(admin, noPass, { pass: "ETP-1001" });
    const [[royal]] = await appConn.query("SELECT royalty_amount FROM orders WHERE id = ?", [noPass]);
    check(Number(royal.royalty_amount) === 300, "the royalty is worked out and kept on the delivery");
    const samePass = await orderFor(local, 5, 1000);
    check(await deliver(admin, samePass, { pass: "ETP-1001", error: "already used" }), "the same pass can't be used twice");
    await appConn.query("UPDATE materials SET royalty_per_unit = 75 WHERE id = ?", [metalId]);
    const [[kept]] = await appConn.query("SELECT royalty_amount FROM orders WHERE id = ?", [noPass]);
    check(Number(kept.royalty_amount) === 300, "a later rate change doesn't alter past royalty");
    await admin.goto(`${BASE}/royalty`);
    check(await seen(admin, 'tr:has-text("ETP-1001")'), "each load appears in the register with its pass");
    check((await admin.locator("body").innerText()).includes("doesn't connect to the portal"), "the page says plainly that it isn't linked to the State portal");
    await admin.fill('input[name="permit_no"]', "LEASE-77");
    await admin.fill('input[name="valid_from"]', `${today.slice(0, 8)}01`);
    await admin.fill('input[name="valid_to"]', `${Number(today.slice(0, 4)) + 1}-03-31`);
    await admin.fill('input[name="qty_allowed"]', "5.2");
    await admin.click("button:has-text('Add permit')");
    await admin.waitForSelector(".alert-ok:has-text('LEASE-77')");
    await admin.reload();
    check(await seen(admin, 'tr:has-text("LEASE-77") td:has-text("0.2")'), "a permit shows what's used and what's left");
    await admin.goto(`${BASE}/alerts`);
    check(await seen(admin, "text=Permit LEASE-77 is"), "a nearly used permit is flagged");
    const royaltyCsv = await (await adminCtx.request.get(`${BASE}/api/export/royalty?month=${month}`)).text();
    check(royaltyCsv.includes("ETP-1001"), "the register downloads as a spreadsheet");
    await rootConn.query(`UPDATE ${DB}.companies SET pass_required = 0 WHERE id = 1`);
    await appConn.query("UPDATE materials SET royalty_per_unit = 0 WHERE id = ?", [metalId]);

    console.log("▸ Tally");
    await appConn.query("UPDATE customers SET name = 'Shree & Sons <Pune>' WHERE id = ?", [local]);
    const tallyUrl = (kind) => `${BASE}/api/export/tally?kind=${kind}&from=${today}&to=${today}`;
    const tallyFile = async (kind) => {
      const res = await adminCtx.request.get(tallyUrl(kind));
      const raw = await res.body();
      return { bom: raw[0] === 0xff && raw[1] === 0xfe, text: raw.subarray(2).toString("utf16le") };
    };
    const parseTally = (text) => admin.evaluate((xml) => {
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      if (doc.querySelector("parsererror")) return { broken: true };
      const vouchers = [...doc.querySelectorAll("VOUCHER")].map((v) => {
        const entries = [...v.querySelectorAll("LEDGERENTRIES\\.LIST")];
        return {
          type: v.getAttribute("VCHTYPE"),
          sum: entries.reduce((s, e) => s + Math.round(Number(e.querySelector("AMOUNT").textContent) * 100), 0),
          signsOk: entries.every((e) => (e.querySelector("ISDEEMEDPOSITIVE").textContent === "Yes") === (Number(e.querySelector("AMOUNT").textContent) < 0)),
          ledgers: entries.map((e) => e.querySelector("LEDGERNAME").textContent),
          date: v.querySelector("DATE").textContent,
          id: v.querySelector("GUID").textContent,
          remoteId: v.getAttribute("REMOTEID"),
          parties: entries.filter((e) => e.querySelector("ISPARTYLEDGER").textContent === "Yes").length,
          bills: [...v.querySelectorAll("BILLALLOCATIONS\\.LIST")].map((b) => b.querySelector("BILLTYPE").textContent),
        };
      });
      return { vouchers, ledgers: [...doc.querySelectorAll("LEDGER")].map((l) => [l.getAttribute("NAME"), l.querySelector("PARENT").textContent]) };
    }, text);
    const vouchersFile = await tallyFile("vouchers");
    check(vouchersFile.bom, "Tally files are saved in Tally's own text format, so Marathi names survive");
    const parsed = await parseTally(vouchersFile.text);
    check(!parsed.broken && parsed.vouchers.length > 5, "the voucher file is valid XML, even with & and < in a customer's name");
    check(parsed.vouchers.every((v) => v.sum === 0), "every voucher's debits and credits balance to the paisa");
    check(parsed.vouchers.every((v) => v.signsOk), "debits and credits use Tally's sign convention");
    check(["Sales", "Receipt", "Payment"].every((type) => parsed.vouchers.some((v) => v.type === type)), "sales, receipts and expenses all come across");
    check(parsed.vouchers.some((v) => v.ledgers.includes("Output CGST") && v.ledgers.includes("Output SGST")), "GST goes to its own ledgers");
    check(parsed.vouchers.every((v) => /^\d{8}$/.test(v.date)), "dates are in Tally's format");
    check(parsed.vouchers.every((v) => v.id && v.id === v.remoteId) && new Set(parsed.vouchers.map((v) => v.id)).size === parsed.vouchers.length, "every voucher keeps its own id, so importing twice overwrites instead of doubling");
    const sales = parsed.vouchers.filter((v) => v.type === "Sales");
    check(sales.every((v) => v.parties === 1 && v.bills.join() === "New Ref"), "each sale raises a bill against the customer");
    check(parsed.vouchers.some((v) => v.type === "Receipt" && v.bills.length === 1 && ["Agst Ref", "On Account"].includes(v.bills[0])), "receipts settle against a bill, or go on account");
    const mastersFile = await tallyFile("masters");
    const masters = await parseTally(mastersFile.text);
    check(masters.ledgers.some(([n, group]) => n === "Shree & Sons <Pune>" && group === "Sundry Debtors"), "customers become Sundry Debtors ledgers");
    check(masters.ledgers.some(([n, group]) => n === "Output CGST" && group === "Duties & Taxes"), "tax ledgers go under Duties & Taxes");

    await admin.goto(`${BASE}/tally`);
    await admin.fill('input[name="ledger_sales"]', "Sales - Aggregates");
    await admin.click('form:has(input[name="ledger_sales"]) button:has-text("Save")');
    await admin.waitForSelector('.alert-ok:has-text("Saved.")');
    const renamed = await parseTally((await tallyFile("vouchers")).text);
    check(renamed.vouchers.some((v) => v.ledgers.includes("Sales - Aggregates")), "ledger names can be matched to an existing Tally company");
    await admin.goto(`${BASE}/tally?from=${today}&to=${today}`);
    await admin.click("text=Mark as imported");
    await admin.waitForSelector(".alert-ok:has-text('marked as imported')");
    const afterMark = await parseTally((await tallyFile("vouchers")).text);
    check(afterMark.vouchers.length === 0, "once imported, nothing is sent twice");
    await rootConn.query(`UPDATE ${DB}.companies SET gst_enabled = 1 WHERE id = 1`);
    const lateBill = await orderFor(local, 1, 1000);
    await deliver(admin, lateBill);
    await admin.goto(`${BASE}/tally?from=${today}&to=${today}`);
    await admin.click("text=Mark as imported");
    await admin.waitForSelector(".alert-ok:has-text('marked as imported')");
    const lateInvoice = await invoiceOf(lateBill);
    admin.once("dialog", (d) => d.accept());
    await admin.goto(`${BASE}/deliveries/${lateBill}`);
    await admin.click("text=Reopen delivery");
    await admin.waitForSelector('input[name="vehicle_number"]');
    await admin.goto(`${BASE}/tally?from=${today}&to=${today}`);
    check(await seen(admin, `.alert-error:has-text("${lateInvoice.number}")`), "an invoice cancelled after import is listed for removal from Tally");
    await rootConn.query(`UPDATE ${DB}.companies SET gst_enabled = 0 WHERE id = 1`);

    console.log("▸ Offline at the gate");
    await rootConn.query(`UPDATE ${DB}.companies SET gst_enabled = 1 WHERE id = 1`);
    await appConn.query("UPDATE users SET site_id = NULL WHERE username = 'ramesh'");
    const bookedForGate = await orderFor(local, 4, 1000);
    const gateCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const gate = await newPage(gateCtx);
    await login(gate, "ramesh", "worker123");
    await gate.waitForSelector('.page-eyebrow:has-text("Ramesh")');
    await gate.waitForFunction(async () => Boolean(await caches.match("/gate")), null, { timeout: 20000, polling: 300 });
    await gate.goto(`${BASE}/gate`);
    await gate.waitForFunction(async () => {
      const open = indexedDB.open("rk-offline");
      const db = await new Promise((resolve) => { open.onsuccess = () => resolve(open.result); open.onerror = () => resolve(null); });
      if (!db || !db.objectStoreNames.contains("meta")) return false;
      const row = await new Promise((resolve) => { const r = db.transaction("meta").objectStore("meta").get("snapshot"); r.onsuccess = () => resolve(r.result); });
      db.close();
      return Boolean(row);
    }, null, { timeout: 15000, polling: 300 });
    await gate.reload();
    await gate.waitForSelector("text=Save load");
    check(await seen(gate, "#gate-customers option[value='Wai Contractors']") || await gate.locator("#gate-customers option").count() > 1, "signing in once prepares the device: customers are stored for later");
    const snapshotText = await gate.evaluate(async () => JSON.stringify(await (await fetch("/api/offline/snapshot")).json()));
    check(!snapshotText.includes("Rival") && !snapshotText.includes("outstanding") && !snapshotText.includes("balance"), "the stored copy has no balances and nothing from another company");

    await stopApp();
    await gateCtx.setOffline(true);
    await gate.reload();
    check(await seen(gate, "text=Save load"), "with the server unreachable, the gate screen still opens");
    check(await seen(gate, ".gate-status:has-text('Offline')"), "…and says it's offline");
    await gate.goto(`${BASE}/deliveries`).catch(() => {});
    check(await seen(gate, "text=Save load"), "any other page asked for offline lands on the gate screen, not a browser error");

    await gate.fill('input[list="gate-customers"]', "Walk-in Contractor");
    await gate.locator("form select").filter({ hasText: "Grade-A Metal" }).selectOption({ label: "Grade-A Metal" });
    await gate.fill('input[list="gate-vehicles"]', "mh 12 of 4242");
    await gate.locator('label:has-text("Rate per") input, label:has-text("Rate") input').first().fill("1000");
    await gate.locator('label:has-text("Empty") input, label:has-text("Tare") input').first().fill("8000");
    await gate.locator('label:has-text("Loaded") input, label:has-text("Gross") input').first().fill("18000");
    check((await gate.locator(".net-line").innerText()).includes("10,000"), "weights work out the net offline too");
    await gate.locator('label:has-text("Paid") input[type="number"]').first().fill("1000");
    await gate.click("text=Save load");
    check(await seen(gate, "text=Saved on this device"), "a load is saved with no connection at all");
    check((await gate.locator(".challan").innerText()).includes("MH 12 OF 4242"), "…and a slip can be printed for the driver");
    check((await gate.locator(".challan").innerText()).includes("not a tax invoice"), "the slip says plainly it isn't a tax invoice");
    await gate.click("text=Next truck");
    await gate.locator("select").first().selectOption({ value: String(bookedForGate) });
    await gate.fill('input[list="gate-vehicles"]', "MH 12 OF 5151");
    await gate.click("text=Save load");
    await gate.waitForSelector("text=Saved on this device");
    await gate.click("text=Next truck");
    await gate.reload();
    check(await seen(gate, "text=Waiting to send: 2"), "entries survive the screen being closed and reopened");
    const [[{ stillNone }]] = await appConn.query("SELECT COUNT(*) AS stillNone FROM orders WHERE offline_ref IS NOT NULL");
    check(stillNone === 0, "nothing has reached the server yet");

    await startApp();
    await gateCtx.setOffline(false);
    await gate.waitForFunction(() => !document.body.innerText.includes("Waiting to send"), null, { timeout: 20000, polling: 300 }).catch(() => {});
    check(!(await gate.locator("body").innerText()).includes("Waiting to send"), "reconnecting sends everything without anyone doing a thing");
    const [synced] = await appConn.query("SELECT o.*, c.name FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.offline_ref IS NOT NULL ORDER BY o.id");
    check(synced.length === 2 && synced.every((o) => o.status === "delivered"), "both loads arrive as completed deliveries");
    const walkIn = synced.find((o) => o.name === "Walk-in Contractor");
    check(walkIn && Number(walkIn.net_kg) === 10000 && Number(walkIn.delivered_qty) === 10 && walkIn.vehicle_number === "MH 12 OF 4242", "a new customer is created and the weights are kept");
    check(Number(walkIn.total_amount) === 10500 && Number(walkIn.balance_amount) === 9500 && walkIn.paid_mode === "cash", "tax and balance come out the same as a delivery made online");
    check(walkIn.delivered_at === walkIn.dispatch_time, "the load is dated when it left, not when the connection came back");
    const gateInvoices = await Promise.all(synced.map((o) => invoiceOf(o.id)));
    check(gateInvoices.every((i) => i?.status === "issued"), "invoices are issued the moment the entries sync");
    check(Number(synced.find((o) => o.id === bookedForGate)?.delivered_qty) === 4, "a booked order completed offline stays the same order");

    const replayRecord = {
      id: synced[0].offline_ref, order_id: null, customer_name: "Walk-in Contractor", material_id: metalId, rate: 1000, vehicle_number: "MH 12 OF 4242",
      arrival_time: `${today} 00:00:00`, dispatch_time: `${today} 00:01:00`, delivered_qty: "10", paid_amount: "1000", paid_mode: "cash",
    };
    const sendRecords = (page, records) => page.evaluate(async (body) => (await (await fetch("/api/offline/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ records: body }) })).json()).results, records);
    const [replayed] = await sendRecords(gate, [replayRecord]);
    const [[{ afterReplay }]] = await appConn.query("SELECT COUNT(*) AS afterReplay FROM orders WHERE offline_ref IS NOT NULL");
    check(replayed.status === "done" && afterReplay === 2, "sending an entry twice can't create a second delivery");

    const newRef = () => globalThis.crypto.randomUUID();
    const base = { ...replayRecord, arrival_time: `${today} 00:00:00`, dispatch_time: `${today} 00:01:00` };
    const [rejectedClock] = await sendRecords(gate, [{ ...base, id: newRef(), dispatch_time: "2099-01-01 00:00:00" }]);
    check(rejectedClock.status === "rejected", "a device with a wrong clock is refused rather than backdating or forward-dating a load");
    const [otherCustomer] = await rootConn.query(`INSERT INTO ${DB}.customers (company_id, name) VALUES (?, 'Rival Customer')`, [foreign.insertId]);
    const [crossed] = await sendRecords(gate, [{ ...base, id: newRef(), customer_id: otherCustomer.insertId }]);
    check(crossed.status === "rejected", "a device can't record a sale against another company's customer");
    const [[{ afterRefusals }]] = await appConn.query("SELECT COUNT(*) AS afterRefusals FROM orders WHERE offline_ref IS NOT NULL");
    check(afterRefusals === 2, "a refused entry leaves nothing behind");

    const concurrent = await Promise.all([1, 2, 3, 4].map(() => sendRecords(gate, [{ ...base, id: newRef(), customer_name: "Rush Hour" }])));
    check(concurrent.every(([r]) => r.status === "done"), "several devices can sync at once");
    const numbers = (await appConn.query("SELECT number FROM invoices WHERE buyer_name = 'Rush Hour' ORDER BY number"))[0].map((r) => Number(r.number.slice(-5)));
    check(new Set(numbers).size === 4 && numbers[3] - numbers[0] === 3, "…and each gets its own invoice number, with no duplicates or gaps");
    const [[{ rushCustomers }]] = await appConn.query("SELECT COUNT(*) AS rushCustomers FROM customers WHERE name = 'Rush Hour'");
    check(rushCustomers >= 1, "a customer name typed offline resolves to a customer record");

    const cookieHeader = (await gateCtx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
    const syncFrom = (headers) => fetch(`${BASE}/api/offline/sync`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ records: [] }) });
    check((await syncFrom({ Cookie: cookieHeader })).status === 403, "a sync with no browser origin is refused");
    check((await syncFrom({ Cookie: cookieHeader, Origin: "https://evil.example" })).status === 403, "a sync from another website is refused");
    check((await syncFrom({ Origin: BASE })).status === 401, "a sync with no login is refused");
    check((await fetch(`${BASE}/api/offline/snapshot`)).status === 401, "the stored data can't be fetched without a login");
    await gateCtx.close();
    await rootConn.query(`UPDATE ${DB}.companies SET gst_enabled = 0 WHERE id = 1`);
    await appConn.query("UPDATE customers SET name = 'Sahyadri Builders' WHERE id = ?", [local]);

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
    await login(worker, "ramesh", "not-the-password");
    await worker.waitForSelector("text=Incorrect username or password");
    check(true, "a wrong password on a disabled login does not reveal that it is disabled");

    console.log("▸ Public site");
    const q0 = async (sql) => (await rootConn.query(`USE ${DB}`), (await rootConn.query(sql))[0]);
    const visitor = await newPage(await browser.newContext());
    await visitor.goto(`${BASE}/`);
    check(new URL(visitor.url()).pathname === "/" && await seen(visitor, "h1:has-text('Run your business from one place')"), "visitors get the landing page at /");
    check((await visitor.title()).includes("Operations Software for Small Businesses"), "the page title carries the main search terms");
    check(await visitor.getAttribute('link[rel="canonical"]', "href") === `${process.env.SITE_URL || "http://localhost:3000"}`, "the canonical address is set");
    check((await visitor.getAttribute('meta[name="robots"]', "content")).startsWith("index"), "the landing page can be indexed");
    const ld = JSON.parse(await visitor.textContent('script[type="application/ld+json"]'));
    check(ld["@graph"].some((n) => n["@type"] === "SoftwareApplication"), "structured data describes the product");
    check(ld["@graph"][1].featureList.some((f) => /GST/.test(f)) && ld["@graph"][1].featureList.some((f) => /Tally/.test(f)) && !ld["@graph"][1].featureList.some((f) => /IRN/.test(f)), "only finished modules are listed as features");
    check(await seen(visitor, "text=Not included yet: e-invoicing (IRN)"), "the website says plainly what isn't included");
    await visitor.fill('.demo-form input[name="name"]', "Demo Person");
    await visitor.fill('.demo-form input[name="company"]', "Test Stone Works");
    await visitor.selectOption('.demo-form select[name="business_type"]', "Workshop or garage");
    await visitor.fill('.demo-form input[name="location"]', "Pune");
    await visitor.fill('.demo-form input[name="phone"]', "+91 98765 43210");
    await visitor.fill('.demo-form input[name="email"]', "demo@example.com");
    await visitor.click(".demo-form button[type=submit]");
    check(await seen(visitor, "text=Thank you. We'll contact you"), "the demo form accepts a request");
    check((await q0("SELECT COUNT(*) AS n FROM enquiries WHERE company = 'Test Stone Works'"))[0].n === 1, "the request is saved");
    await admin.goto(`${BASE}/enquiries`);
    check(await seen(admin, "text=Test Stone Works"), "the owner sees demo requests");
    for (const s of ["small-business-operations-software", "workshop-management-software", "quarry-management-software", "stone-crusher-management-software", "aggregate-inventory-management", "weighbridge-management-software", "quarry-dispatch-management"]) {
      await visitor.goto(`${BASE}/${s}`);
      check(await seen(visitor, "h1") && (await visitor.getAttribute('link[rel="canonical"]', "href")).endsWith(`/${s}`), `/${s} is public, with its own canonical address`);
    }
    await visitor.goto(`${BASE}/mr`);
    check(await visitor.evaluate(() => document.documentElement.lang) === "mr" && await seen(visitor, "h1:has-text('एकाच ठिकाणाहून')"), "the Marathi page has its own URL and language");
    const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
    check(sitemap.includes("/mr") && (await (await fetch(`${BASE}/robots.txt`)).text()).includes("Sitemap:"), "robots.txt and the sitemap are public");
    check((await fetch(`${BASE}/opengraph-image`)).headers.get("content-type") === "image/png", "the social sharing image is generated");
    await admin.goto(`${BASE}/`);
    check(await seen(admin, ".side-brand"), "signed-in people still get their dashboard at /");
    check((await (await fetch(`${BASE}/customers`, { redirect: "manual" })).status) === 307, "private pages still need a login");

    console.log("▸ Companies are kept apart");
    const q = async (sql, p = []) => (await rootConn.query(`USE ${DB}`), (await rootConn.query(sql, p))[0]);
    const otherCtx = await browser.newContext();
    const other = await newPage(otherCtx);
    await other.goto(`${BASE}/signup`);
    await other.fill('input[name="company_name"]', "Second Quarry");
    await other.fill('input[name="full_name"]', "Asha Patil");
    await other.fill('input[name="username"]', "asha");
    await other.fill('input[name="password"]', "second-pass-1");
    await other.check('input[name="agree"]');
    await other.click('button[type="submit"]');
    await other.waitForSelector(".side-brand");
    check(true, "a new company can sign up and is signed in");
    const [{ company_id: second }] = await q("SELECT company_id FROM users WHERE username = 'asha'");
    const [co] = await q("SELECT plan, access_until FROM companies WHERE id = ?", [second]);
    check(second !== 1 && co.plan === "trial" && co.access_until, "a new company starts on a trial, separate from company 1");
    const [firstCustomer] = await q("SELECT id, name FROM customers WHERE company_id = 1 AND name = 'Shree Builders'");
    const [firstOrder] = await q("SELECT id FROM orders WHERE company_id = 1 LIMIT 1");
    for (const path of ["/", "/customers", "/orders", "/deliveries", "/accounts", "/cash", "/invoices", "/gst", "/royalty", "/tally", "/sites", "/expenses", "/users", "/activity", "/staff", "/payroll", "/attendance", "/orders/new", "/production", "/stock", "/vehicles", "/alerts"]) {
      await other.goto(`${BASE}${path}`);
      await other.waitForLoadState("networkidle");
      const body = await other.textContent("body");
      check(await seen(other, ".side-brand") && !/Shree Builders|ramesh|Ramesh|Grade-A Metal|MH 14 XY 9999|Hill Site|LEASE-77|Sahyadri|ETP-1001/.test(body), `another company's data is not on ${path}`);
    }
    await other.goto(`${BASE}/customers/${firstCustomer.id}`);
    check(await seen(other, "text=Page not found"), "another company's customer can't be opened by address");
    await other.goto(`${BASE}/deliveries/${firstOrder.id}`);
    check(await seen(other, "text=Page not found"), "another company's order can't be opened by address");

    const [firstMaterial] = await q("SELECT id FROM materials WHERE company_id = 1 AND name = 'Grade-A Metal'");
    await other.goto(`${BASE}/stock/${firstMaterial.id}`);
    check(await seen(other, "text=Page not found"), "another company's material can't be opened by address");
    const [firstDelivered] = await q("SELECT id FROM orders WHERE company_id = 1 AND status = 'delivered' LIMIT 1");
    await other.goto(`${BASE}/deliveries/${firstDelivered.id}/challan`);
    check(await seen(other, "text=Page not found"), "another company's challan can't be opened by address");
    await q("INSERT INTO materials (company_id, name) VALUES (?, 'Own Metal')", [second]);
    await other.goto(`${BASE}/production`);
    await other.waitForSelector('select[name="material_id"]');
    await other.evaluate((target) => {
      const select = document.querySelector('select[name="material_id"]');
      select.add(new Option("forged", target));
      select.value = target;
    }, firstMaterial.id);
    await other.fill('input[name="qty"]', "999");
    await other.click("text=Save production");
    check(await seen(other, "text=That material no longer exists"), "a forged form can't add production to another company's material");

    await q("INSERT INTO customers (company_id, name) VALUES (?, 'Own Customer')", [second]);
    const [own] = await q("SELECT id FROM customers WHERE company_id = ?", [second]);
    await other.goto(`${BASE}/customers/${own.id}`);
    await other.waitForLoadState("networkidle");
    await other.evaluate((target) => {
      const form = document.querySelector('form input[name="id"]').form;
      form.querySelector('input[name="id"]').value = target;
      form.querySelector('input[name="name"]').value = "HACKED";
      form.requestSubmit();
    }, firstCustomer.id);
    await other.waitForTimeout(800);
    check((await q("SELECT name FROM customers WHERE id = ?", [firstCustomer.id]))[0].name === firstCustomer.name, "a forged form can't change another company's customer");
    await other.goto(`${BASE}/customers/${own.id}`);
    await other.waitForLoadState("networkidle");
    await other.evaluate((target) => {
      const form = document.querySelector('form input[name="amount"]').form;
      form.querySelector('input[name="customer_id"]').value = target;
      form.querySelector('input[name="amount"]').value = "999";
      form.requestSubmit();
    }, firstCustomer.id);
    await other.waitForTimeout(800);
    check((await q("SELECT COUNT(*) AS n FROM customer_payments WHERE amount = 999"))[0].n === 0, "a forged form can't add a payment to another company's customer");

    console.log("▸ Plans and billing");
    await q("UPDATE companies SET access_until = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE id = ?", [second]);
    await other.waitForTimeout(31000); // changed outside the app, so wait out the 30-second user cache
    await other.goto(`${BASE}/`);
    await other.waitForURL("**/billing");
    check(await seen(other, "text=Your access has ended"), "the billing page says access has ended");
    await other.goto(`${BASE}/customers`);
    check(await other.waitForURL("**/billing", { timeout: 3000 }).then(() => true, () => false), "when access ends, the company is held at the billing page");
    await admin.goto(`${BASE}/customers`);
    check(await seen(admin, "text=Shree Builders"), "company 1 never expires");
    const crypto = await import("node:crypto");
    const paid = JSON.stringify({ event: "payment_link.paid", payload: { payment_link: { entity: { id: "plink_1", amount_paid: 100000, reference_id: `co${second}-1` } } } });
    const hook = (body, sig, id = "evt_1") => fetch(`${BASE}/api/billing/webhook`, { method: "POST", body, headers: { "x-razorpay-signature": sig, "x-razorpay-event-id": id } });
    const sign = (b) => crypto.createHmac("sha256", WEBHOOK_SECRET).update(b).digest("hex");
    check((await hook(paid, "0".repeat(64))).status === 401, "a payment message with a bad signature is refused");
    check((await q("SELECT access_until < NOW() AS expired FROM companies WHERE id = ?", [second]))[0].expired === 1, "a refused message changes nothing");
    check((await hook(paid, sign(paid))).status === 200, "a signed payment is accepted");
    const [renewed] = await q("SELECT plan, access_until, access_until > NOW() AS open FROM companies WHERE id = ?", [second]);
    check(renewed.plan === "paid" && renewed.open === 1, "payment restores access");
    await hook(paid, sign(paid));
    check((await q("SELECT access_until FROM companies WHERE id = ?", [second]))[0].access_until === renewed.access_until, "the same payment delivered twice counts once");
    await other.goto(`${BASE}/customers`);
    check(await seen(other, "text=Own Customer"), "the company is back in after paying");
    await other.goto(`${BASE}/enquiries`);
    check(await seen(other, "text=Page not found"), "customer companies can't see demo requests");
    for (const path of ["/signup", "/terms", "/privacy"]) check((await fetch(`${BASE}${path}`, { redirect: "manual" })).status === 200, `${path} is public`);

    const [[{ theirInvoice }]] = await appConn.query("SELECT MIN(id) AS theirInvoice FROM invoices WHERE company_id = 1");
    const otherRequest = other.context().request;
    await other.goto(`${BASE}/invoices/${theirInvoice}`);
    check(await seen(other, "text=Page not found"), "another company's invoice can't be opened by its address");
    check((await otherRequest.get(`${BASE}/api/export/ewaybill?id=${theirInvoice}`)).status() === 404, "…or downloaded as an e-way bill");
    check(!(await (await otherRequest.get(`${BASE}/api/export/gst?month=${today.slice(0, 7)}&kind=b2b`)).text()).includes("27AAPFU0939F1ZV"), "GST sheets hold only your own invoices");
    const otherTally = (await (await otherRequest.get(`${BASE}/api/export/tally?kind=masters&from=${today}&to=${today}`)).body()).subarray(2).toString("utf16le");
    check(!/Sahyadri|Shree/.test(otherTally), "Tally files hold only your own customers");

    console.log("▸ Friendly failures");
    await admin.goto(`${BASE}/this-page-does-not-exist`);
    check(await seen(admin, ".status-page >> text=Page not found"), "an unknown address shows the branded not-found page");

    await admin.goto(`${BASE}/expenses`);
    admin.once("dialog", (d) => d.accept());
    await admin.locator('tr:has(button) button').first().click();
    check(await seen(admin, ".flash:has-text('Expense deleted')"), "a one-click delete confirms what it did");
    const flashOrder = await orderFor(local, 1, 1000);
    admin.once("dialog", (d) => d.accept());
    await admin.goto(`${BASE}/deliveries/${flashOrder}`);
    await admin.click("button:has-text('Cancel this order')");
    check(await seen(admin, `.flash:has-text("Order #${flashOrder} cancelled")`), "cancelling an order confirms it, even across a redirect");
    await admin.reload();
    await admin.waitForSelector("h1:has-text('Deliveries')");
    check(await admin.locator(".flash").count() === 0, "…and the message doesn't come back on the next page");

    console.log("▸ Site quality");
    const badPage = await fetch(`${BASE}/no-such-page`, { redirect: "manual" });
    check(badPage.status === 404 && (await badPage.text()).includes("Page not found"), "a mistyped address shows a real 404, not the login page");
    check((await fetch(`${BASE}/customers`, { redirect: "manual" })).status === 307, "…while app pages still ask a visitor to sign in");
    for (const asset of ["/favicon.ico", "/apple-icon.png", "/icon-192.png", "/icon-512.png", "/icon-maskable.png"]) {
      const res = await fetch(`${BASE}${asset}`);
      check(res.ok && /image/.test(res.headers.get("content-type")) && (await res.arrayBuffer()).byteLength < 20 * 1024, `${asset} exists and is small`);
    }
    const manifest = await (await fetch(`${BASE}/manifest.webmanifest`)).json();
    check(manifest.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable"), "the app can be installed with a proper icon");

    const PUBLIC_PAGES = ["/", "/mr", "/small-business-operations-software", "/workshop-management-software", "/quarry-management-software", "/stone-crusher-management-software", "/aggregate-inventory-management", "/weighbridge-management-software", "/quarry-dispatch-management", "/terms", "/privacy", "/login", "/signup"];
    const APP_PAGES = ["/", "/orders/new", "/orders", "/deliveries", "/expenses", "/attendance", "/production", "/stock", "/vehicles", "/alerts", "/customers", `/customers/${local}`, "/accounts", "/payroll", "/staff", "/users", "/activity", "/company", "/billing", "/enquiries", "/cash", "/invoices", `/invoices/${inv.id}`, "/gst", "/royalty", "/tally", "/sites"];
    const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const phoneVisitor = { "x-forwarded-for": "198.51.100.7" };
    const seenTitles = new Map();
    const publicPhone = await browser.newContext({ viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true, extraHTTPHeaders: phoneVisitor });
    const phone = await newPage(publicPhone);
    const hrefs = new Set();
    for (const path of PUBLIC_PAGES) {
      await phone.goto(`${BASE}${path}`, { waitUntil: "load" });
      const page = await phone.evaluate(() => ({
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.content ?? "",
        h1: document.querySelectorAll("h1").length,
        icon: document.querySelectorAll('link[rel~="icon"]').length,
        links: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")),
      }));
      check(await sideways(phone) <= 1, `${path} doesn't scroll sideways on a small phone`);
      check(page.title && !seenTitles.has(page.title), `${path} has its own title`);
      seenTitles.set(page.title, path);
      check(page.description.length >= 50 && page.description.length <= 165, `${path} has a meta description`);
      check(page.h1 === 1 && page.icon > 0, `${path} has one main heading and a favicon`);
      page.links.forEach((l) => hrefs.add(l));
    }
    const internal = [...hrefs].filter((l) => !/^(mailto|tel|#)/.test(l) && !/^https?:/.test(l)).map((l) => l.split("#")[0]).filter(Boolean);
    const failures = (await Promise.all([...new Set(internal)].map(async (l) => [l, (await fetch(`${BASE}${l}`, { headers: phoneVisitor })).status]))).filter(([, code]) => code >= 400);
    check(failures.length === 0, `every link on the public site works${failures.length ? `: ${failures.join(" ")}` : ""}`);
    check(hrefs.has("tel:+919876543210") && hrefs.has("mailto:hello@example.in"), "the phone number and email can be tapped");
    const siteMapXml = await (await fetch(`${BASE}/sitemap.xml`)).text();
    const listed = [...siteMapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
    check(listed.length >= 7 && (await Promise.all(listed.map(async (l) => (await fetch(`${BASE}${l}`, { headers: phoneVisitor })).status))).every((c) => c === 200), "every page in the sitemap exists");

    await phone.goto(`${BASE}/`);
    check(!(await phone.locator(".lp-nav a.nav-wide").first().isVisible()), "the website's wide menu is hidden on a phone");
    await phone.click(".site-menu-btn");
    await phone.waitForSelector(".site-menu");
    check(await phone.locator(".site-menu a").count() === 5, "…and a phone menu opens with the same links");
    await phone.keyboard.press("Escape");
    await phone.waitForSelector(".site-menu", { state: "detached" });
    await phone.click(".site-menu-btn");
    await phone.click('.site-menu a[href="#modules"]');
    await phone.waitForSelector(".site-menu", { state: "detached" });
    check(await phone.waitForFunction(() => scrollY > 200, null, { timeout: 4000, polling: 100 }).then(() => true, () => false), "choosing a link closes the menu and goes there");
    await publicPhone.close();

    const ownerPhone = await browser.newContext({ storageState: await adminCtx.storageState(), viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.8" } });
    const ownerPage = await newPage(ownerPhone);
    const offenders = [];
    const smallFonts = [];
    for (const path of APP_PAGES) {
      await ownerPage.goto(`${BASE}${path}`, { waitUntil: "load" });
      await ownerPage.waitForTimeout(80);
      if (await sideways(ownerPage) > 1) offenders.push(path);
      const small = await ownerPage.evaluate(() => [...document.querySelectorAll("main input:not([type=hidden]):not([type=checkbox]):not([type=radio]), main select, main textarea")]
        .filter((el) => el.getBoundingClientRect().width && parseFloat(getComputedStyle(el).fontSize) < 16).length);
      if (small) smallFonts.push(path);
    }
    check(offenders.length === 0, `no app page scrolls sideways on a small phone${offenders.length ? `: ${offenders}` : ""}`);
    check(smallFonts.length === 0, `form fields are large enough that phones don't zoom in${smallFonts.length ? `: ${smallFonts}` : ""}`);
    await ownerPage.goto(`${BASE}/customers`);
    check(await seen(ownerPage, 'a[href^="tel:"]'), "customers' phone numbers can be tapped to call");
    await ownerPhone.close();

    console.log("▸ The journey");
    const filmBrowser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
    const filmCtx = await filmBrowser.newContext({ viewport: { width: 1180, height: 720 }, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.9" } });
    const film = await newPage(filmCtx);
    await film.goto(`${BASE}/welcome`);
    check(await film.waitForSelector(".exp[data-painted] canvas", { timeout: 40000 }).then(() => true, () => false), "with 3D available, the line is on screen");
    check(await film.locator("[data-row]").count() === 8 && await film.locator(".step").count() === 8, "the record has one row for each of the eight steps");
    const scrollTo = (share) => film.evaluate((k) => { const r = document.querySelector(".journey-run"); window.scrollTo(0, (r.offsetHeight - innerHeight) * k); }, share);
    const rowNow = () => film.locator("[data-row][data-state='now'] span").textContent();
    await scrollTo(0.14);
    await film.waitForFunction(() => document.querySelector("[data-row='0']").dataset.state === "now", null, { timeout: 8000 });
    check(await rowNow() === "Production", "the journey starts where the product is made");
    await film.click("[data-row='5']");
    await film.waitForFunction(() => document.querySelector("[data-row='5']").dataset.state === "now", null, { timeout: 25000 }).catch(() => {});
    check(await rowNow() === "Invoice" && await film.locator("[data-row][data-state='past']").count() === 5, "clicking a row jumps to that step, and earlier steps show as done");
    await scrollTo(1);
    await film.waitForFunction(() => document.querySelector("[data-row='7']").dataset.state === "now", null, { timeout: 25000 }).catch(() => {});
    check(await rowNow() === "Daily Cash" && (await film.locator(".app").innerText()).includes("₹0 difference"), "the same record ends with the day's cash closed");
    check(!/Patil/.test(await film.locator(".journey-run").innerText()), "no real name is used on the journey");
    await filmBrowser.close();

    const stillCtx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1180, height: 720 }, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.10" } });
    const still = await newPage(stillCtx);
    await still.goto(`${BASE}/welcome`);
    await still.waitForSelector(".step");
    check(await still.locator("canvas").count() === 0 && !(await still.locator(".exp[data-live]").count()), "with reduced motion on, nothing animates");
    check(await still.locator(".step:visible").count() === 8, "…and every stop reads straight down the page");
    await stillCtx.close();
    const savingCtx = await browser.newContext({ viewport: { width: 390, height: 800 }, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.11" } });
    await savingCtx.addInitScript(() => Object.defineProperty(navigator, "connection", { value: { saveData: true } }));
    const saving = await newPage(savingCtx);
    const heavy3d = [];
    saving.on("response", (r) => { if (/three|Scene/i.test(r.url())) heavy3d.push(r.url()); });
    await saving.goto(`${BASE}/welcome`);
    await saving.waitForTimeout(1200);
    check(await saving.locator("canvas").count() === 0 && await saving.evaluate(() => getComputedStyle(document.querySelector(".journey-pin")).backgroundImage.includes("line.webp")), "on a data-saving connection the still picture is shown instead");
    await savingCtx.close();
    const poster = await fetch(`${BASE}/line.webp`);
    check(poster.ok && (await poster.arrayBuffer()).byteLength < 120 * 1024, "the still picture is small");

    console.log("▸ Performance & cache");
    // An account still on the old bcrypt hash signs in fine and is upgraded to scrypt.
    const bcrypt = (await import("bcryptjs")).default;
    await rootConn.query(`INSERT INTO ${DB}.users (company_id, username, full_name, password_hash, role) VALUES (1, 'legacy', 'Legacy User', ?, 'worker')`,
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
  console.log("▸ Abuse limits");
  const statuses = [];
  for (let i = 0; i < 170; i++) statuses.push((await fetch(`${BASE}/login`, { method: "POST" })).status);
  check(statuses.includes(429), "a flood of requests is cut off");
    check((await (await fetch(`${BASE}/login`, { method: "POST" })).text()).includes("Please wait a moment"), "a blocked visitor sees a plain-language page");

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
