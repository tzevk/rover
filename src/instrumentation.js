// Runs once when the server starts. The Node-only work lives in a separate file behind this
// exact check, which lets Next.js leave the database driver out of its Edge bundle.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
