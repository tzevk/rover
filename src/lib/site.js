// Public-site settings. SITE_URL must be the real address in production: search engines use it
// for canonical links and the sitemap. Contact details only appear on the page once they're set.
export const SITE = {
  name: "R.K. Enterprises",
  url: (process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")).replace(/\/$/, ""),
  phone: process.env.CONTACT_PHONE || "", // with country code, e.g. 919876543210
  email: process.env.CONTACT_EMAIL || "",
  signupOpen: process.env.SIGNUP_ENABLED === "1", // internal platform: off unless deliberately enabled
};
