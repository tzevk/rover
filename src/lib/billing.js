import { SITE } from "./site";

export const TRIAL_DAYS = 14;
export const PLAN_DAYS = 30;

// Price per PLAN_DAYS in rupees. Unset means online payment is switched off.
export const planPrice = () => Number(process.env.PLAN_PRICE_INR) || 0;
export const billingReady = () => Boolean(planPrice() && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

// A hosted Razorpay payment page. reference_id ties the webhook back to the company.
export async function createPaymentLink(user) {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/payment_links/", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: planPrice() * 100,
      currency: "INR",
      reference_id: `co${user.company_id}-${Date.now()}`,
      description: `${SITE.name}: ${PLAN_DAYS} days`,
      customer: { name: user.company_name },
      callback_url: `${SITE.url}/billing`,
      callback_method: "get",
    }),
  });
  if (!res.ok) throw new Error(`Razorpay responded ${res.status}`);
  return (await res.json()).short_url;
}
