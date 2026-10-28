"use client";

// Last-resort screen if even the main layout fails to render.
export default function GlobalError({ reset }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#f2eee5", color: "#1a2920" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1>Something went wrong</h1>
          <p style={{ color: "#6d7266" }}>Your saved data is safe. Please try again.</p>
          <button onClick={() => reset()} style={{ padding: "10px 18px", borderRadius: 10, border: 0, background: "#1d3f2c", color: "#fff", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
