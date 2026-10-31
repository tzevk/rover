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
  await rejects(appConn.query("INSERT INTO customers (name) VALUES ('No Company')"), "a record can't be saved without a company");
  await rejects(appConn.query("DROP TABLE orders"), "app login cannot DROP tables");
  await rejects(appConn.query("ALTER TABLE orders ADD COLUMN x INT"), "app login cannot change the schema");
  await rejects(appConn.query("UPDATE audit_log SET action = 'x'"), "activity log cannot be edited");
  await rejects(appConn.query("DELETE FROM audit_log"), "activity log cannot be erased");
  await appConn.query("INSERT INTO customers (company_id, name) VALUES (1, 'Rule Test')");
  const [[{ cid }]] = await appConn.query("SELECT id AS cid FROM customers WHERE name = 'Rule Test'");
  await rejects(appConn.query("INSERT INTO orders (company_id, customer_id, ordered_qty, rate, total_amount) VALUES (1, ?, 10, 100, 999)", [cid]),
    "database rejects a total that isn't qty × rate");
  await rejects(appConn.query("INSERT INTO orders (company_id, customer_id, ordered_qty, rate, total_amount) VALUES (1, ?, -1, 100, -100)", [cid]),
    "database rejects negative quantities");
  await rejects(appConn.query(
    "INSERT INTO orders (company_id, customer_id, ordered_qty, rate, total_amount, status) VALUES (1, ?, 1, 100, 100, 'delivered')", [cid]),
    "database rejects a 'delivered' order with no vehicle, times or payment");
  await rejects(appConn.query("INSERT INTO expenses (company_id, expense_date, category, amount) VALUES (1, '2026-01-01', 'fuel', 0)"),
    "database rejects zero/negative expenses");
  await rejects(appConn.query("INSERT INTO expenses (company_id, expense_date, category, amount) VALUES (1, '2026-01-01', 'bribes', 10)"),
    "database rejects unknown expense types");

  // ── 4. Build and start the app against the test database
  console.log("▸ Building and starting the app");
  run(process.execPath, [`${root}/node_modules/next/dist/bin/next`, "build"], { NEXT_DIST_DIR: ".next-test" });
  const appPort = await freePort();
  const WEBHOOK_SECRET = "test-webhook-secret";
  if (process.env.KEEP_ON_FAIL || process.env.KEEP_SERVERS) console.log(`  app: http://localhost:${appPort}  db port: ${dbPort}`);
  // "localhost", not 127.0.0.1: Next.js rewrites 127.0.0.1 to localhost in redirects, which would drop cookies.
  const BASE = `http://localhost:${appPort}`;
  const app = spawn(process.execPath, [`${root}/node_modules/next/dist/bin/next`, "start", "-p", String(appPort)], {
    cwd: root, env: { ...process.env, ...appEnv, NODE_ENV: "production", NEXT_DIST_DIR: ".next-test", HEALTH_DETAILS: "1", PLAN_PRICE_INR: "1000", RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET, SIGNUP_ENABLED: "1" },
    stdio: ["ignore", fs.openSync(`${tmp}/app.log`, "a"), fs.openSync(`${tmp}/app.log`, "a")],
  });
  children.push(app);
  await waitFor(async () => { const r = await fetch(`${BASE}/api/health`); if (!r.ok) throw new Error(r.status); }, "App");
  const health = await (await fetch(`${BASE}/api/health`)).json();
  check(health.status === "ok" && health.schema === "006_operations.sql", "health check reports app + database up");
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
    await worker.waitForSelector("h1:has-text('खाणीवरील')");
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
    const addMaterial = async (name, rate, opening, low) => {
      await admin.fill('input[name="name"]', name);
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
    for (const amount of [100, 110, 120, 130, 140]) await rootConn.query(`INSERT INTO ${DB}.expenses (company_id, expense_date, category, amount) VALUES (1, CURDATE() - INTERVAL 20 DAY, 'other', ?)`, [amount]);
    await rootConn.query(`INSERT INTO ${DB}.expenses (company_id, expense_date, category, amount) VALUES (1, CURDATE(), 'other', 9000)`);
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
    check(new URL(visitor.url()).pathname === "/" && await seen(visitor, "h1:has-text('Run your quarry from one place')"), "visitors get the landing page at /");
    check((await visitor.title()).includes("Quarry Management Software"), "the page title carries the main search terms");
    check(await visitor.getAttribute('link[rel="canonical"]', "href") === `${process.env.SITE_URL || "http://localhost:3000"}`, "the canonical address is set");
    check((await visitor.getAttribute('meta[name="robots"]', "content")).startsWith("index"), "the landing page can be indexed");
    const ld = JSON.parse(await visitor.textContent('script[type="application/ld+json"]'));
    check(ld["@graph"].some((n) => n["@type"] === "SoftwareApplication"), "structured data describes the product");
    check(!ld["@graph"][1].featureList.some((f) => /GST|multi-location/i.test(f)), "planned modules aren't listed as features");
    check(await seen(visitor, ".module-planned:has-text('GST Invoicing') .tag-planned"), "planned modules are labelled as planned");
    await visitor.fill('.demo-form input[name="name"]', "Demo Person");
    await visitor.fill('.demo-form input[name="company"]', "Test Stone Works");
    await visitor.selectOption('.demo-form select[name="business_type"]', "Quarry");
    await visitor.fill('.demo-form input[name="location"]', "Pune");
    await visitor.fill('.demo-form input[name="phone"]', "+91 98765 43210");
    await visitor.fill('.demo-form input[name="email"]', "demo@example.com");
    await visitor.click(".demo-form button[type=submit]");
    check(await seen(visitor, "text=Thank you. We'll contact you"), "the demo form accepts a request");
    check((await q0("SELECT COUNT(*) AS n FROM enquiries WHERE company = 'Test Stone Works'"))[0].n === 1, "the request is saved");
    await admin.goto(`${BASE}/enquiries`);
    check(await seen(admin, "text=Test Stone Works"), "the owner sees demo requests");
    for (const s of ["quarry-management-software", "stone-crusher-management-software", "aggregate-inventory-management", "weighbridge-management-software", "quarry-dispatch-management"]) {
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
    for (const path of ["/", "/customers", "/orders", "/deliveries", "/accounts", "/expenses", "/users", "/activity", "/staff", "/payroll", "/attendance", "/orders/new", "/production", "/stock", "/vehicles", "/alerts"]) {
      await other.goto(`${BASE}${path}`);
      await other.waitForLoadState("networkidle");
      const body = await other.textContent("body");
      check(await seen(other, ".side-brand") && !/Shree Builders|ramesh|Ramesh|Grade-A Metal|MH 14 XY 9999/.test(body), `another company's data is not on ${path}`);
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

    console.log("▸ Friendly failures");
    await admin.goto(`${BASE}/this-page-does-not-exist`);
    check(await seen(admin, ".status-page >> text=Page not found"), "an unknown address shows the branded not-found page");

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
