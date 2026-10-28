"use client";

import { AlertTriangle, RotateCw } from "lucide-react";

// Shown instead of a broken page when something fails while loading (e.g. the database is unreachable).
export default function AppError({ error, reset }) {
  return (
    <div className="card card-pad" style={{ maxWidth: 560, margin: "40px auto", textAlign: "center" }}>
      <AlertTriangle size={36} style={{ color: "var(--accent)" }} />
      <h1 style={{ fontSize: 22, margin: "12px 0 6px" }}>This page couldn&apos;t load</h1>
      <p className="muted" style={{ margin: "0 0 20px" }}>
        Usually the internet or the database server is briefly unavailable. Nothing you saved earlier has been lost.
      </p>
      <button className="btn btn-primary" onClick={() => reset()}><RotateCw size={16} /> Try again</button>
      {error?.digest && <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>Reference: {error.digest}</p>}
    </div>
  );
}
