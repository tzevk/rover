import crypto from "node:crypto";
import { PLAN_DAYS, planPrice } from "@/lib/billing";
import { invalidate, TAGS } from "@/lib/cache";
import { transaction } from "@/lib/db";

export const dynamic = "force-dynamic";

function validSignature(body, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = Buffer.from(crypto.createHmac("sha256", secret).update(body).digest("hex"));
  const got = Buffer.from(signature);
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

// Razorpay calls this when a payment link is paid. Access is only ever extended here, on a signed
// message, never from the browser's return to /billing.
export async function POST(req) {
  const body = await req.text(); // the signature covers the raw bytes
  if (!validSignature(body, req.headers.get("x-razorpay-signature"))) return new Response(null, { status: 401 });

  try {
    const event = JSON.parse(body);
    if (event.event !== "payment_link.paid") return new Response(null, { status: 200 });
    const link = event.payload?.payment_link?.entity;
    const company = Number(/^co(\d+)-/.exec(link?.reference_id ?? "")?.[1]);
    const amount = Number(link?.amount_paid);
    const id = req.headers.get("x-razorpay-event-id") || link?.id;
    if (!company || !id || !(amount >= planPrice() * 100)) return new Response(null, { status: 200 });

    await transaction(async (tx) => {
      await tx.query("INSERT INTO billing_events (event_id, company_id, amount) VALUES (?, ?, ?)", [id, company, amount]);
      // Paying early adds to the time left. access_until NULL means no expiry, so it's left alone.
      await tx.query(
        `UPDATE companies SET plan = 'paid', access_until = DATE_ADD(GREATEST(access_until, NOW()), INTERVAL ? DAY)
         WHERE id = ? AND access_until IS NOT NULL`,
        [PLAN_DAYS, company],
      );
    });
    invalidate(TAGS.users);
    return new Response(null, { status: 200 });
  } catch (err) {
    if (err?.code === "ER_DUP_ENTRY") return new Response(null, { status: 200 }); // already counted
    console.error("[billing webhook]", err);
    return new Response(null, { status: 500 }); // Razorpay will retry
  }
}
