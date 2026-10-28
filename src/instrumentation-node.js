import { warmPool } from "./lib/db";

// Open database connections before the first visitor arrives.
if (process.env.DB_HOST) {
  const started = Date.now();
  await warmPool(4)
    .then(() => console.log(`[db] connection pool warmed in ${Date.now() - started} ms`))
    .catch((err) => console.warn("[db] could not warm the connection pool:", err.message));
}
