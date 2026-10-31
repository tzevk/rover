import { SEO_PAGES } from "@/components/landing/seo-pages";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export default function sitemap() {
  const languages = { en: SITE.url, mr: `${SITE.url}/mr` };
  return [
    { url: SITE.url, changeFrequency: "monthly", priority: 1, alternates: { languages } },
    { url: `${SITE.url}/mr`, changeFrequency: "monthly", priority: 0.9, alternates: { languages } },
    ...Object.keys(SEO_PAGES).map((s) => ({ url: `${SITE.url}/${s}`, changeFrequency: "monthly", priority: 0.8 })),
  ];
}
