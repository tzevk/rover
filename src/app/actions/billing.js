"use server";

import { redirect } from "next/navigation";
import { guarded } from "@/lib/action";
import { requireAccount } from "@/lib/auth";
import { billingReady, createPaymentLink } from "@/lib/billing";

export const startPayment = guarded("startPayment", async () => {
  const user = await requireAccount();
  if (user.role !== "admin" || !billingReady()) redirect("/billing");
  redirect(await createPaymentLink(user));
});
