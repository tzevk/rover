import { cacheStats } from "@/lib/cache";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// For uptime monitors: 200 when the app and database are both working, 503 otherwise.
export async function GET() {
  const started = Date.now();
  try {
    const [row] = await query(
      "SELECT 1 AS ok, (SELECT MAX(version) FROM schema_migrations) AS schema_version",
    );
    // Public endpoint: internals only when explicitly switched on.
    const details = process.env.HEALTH_DETAILS === "1"
      ? { schema: row.schema_version, ms: Date.now() - started, cache: cacheStats() }
      : {};
    return Response.json({ status: "ok", db: "up", ...details });
  } catch (err) {
    console.error("health check failed", err);
    return Response.json({ status: "error" }, { status: 503 });
  }
}
