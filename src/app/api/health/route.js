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
    return Response.json({ status: "ok", db: "up", schema: row.schema_version, ms: Date.now() - started, cache: cacheStats() });
  } catch (err) {
    console.error("health check failed", err);
    return Response.json({ status: "error", db: "down" }, { status: 503 });
  }
}
