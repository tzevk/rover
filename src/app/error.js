"use client";

import ErrorCard from "@/components/ErrorCard";
import Logo from "@/components/Logo";

// Catches what (app)/error.js can't: failures in the app layout itself (a signed-in check while
// the server is unavailable) and on pages outside it.
export default function RootError({ reset }) {
  return (
    <main className="status-page">
      <div className="backdrop" aria-hidden="true" />
      <Logo size={44} />
      <ErrorCard reset={reset} />
    </main>
  );
}
