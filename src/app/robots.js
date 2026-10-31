import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic"; // SITE_URL is read when served, not at build time

export default function robots() {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/login", "/signup", "/welcome"] },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
