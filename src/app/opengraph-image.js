import { ImageResponse } from "next/og";

export const alt = "R.K. Enterprises: Quarry Operations Management Software";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The card shown when the site is shared on WhatsApp, Facebook, LinkedIn and others.
export default function OpengraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, color: "#1f1d17", background: "#f8f3e8" }}>
      <div style={{ fontSize: 30, color: "#95590a", fontWeight: 700 }}>R.K. Enterprises</div>
      <div style={{ fontSize: 66, fontWeight: 700, lineHeight: 1.1, marginTop: 24 }}>Run your quarry from one place.</div>
      <div style={{ fontSize: 30, marginTop: 28, color: "#625d50" }}>Quarry Operations Management Software</div>
    </div>,
    size,
  );
}
