import Link from "next/link";
import { ArrowRight, Check, Clock } from "lucide-react";
import Logo from "@/components/Logo";
import { SITE } from "@/lib/site";
import { SEO_PAGES } from "./seo-pages";
import { fontClasses } from "./fonts";
import "./landing.css";

export function seoMetadata(slug) {
  const p = SEO_PAGES[slug];
  return {
    title: { absolute: p.title }, description: p.description,
    alternates: { canonical: `/${slug}` },
    openGraph: { type: "article", url: `/${slug}`, siteName: SITE.name, title: p.title, description: p.description },
    robots: { index: true, follow: true },
  };
}

export default function SeoPage({ slug }) {
  const p = SEO_PAGES[slug];
  const others = Object.entries(SEO_PAGES).filter(([s]) => s !== slug);
  const json = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: SITE.url }, { "@type": "ListItem", position: 2, name: p.h1, item: `${SITE.url}/${slug}` }] },
      { "@type": "FAQPage", mainEntity: p.faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    ],
  }).replace(/</g, "\\u003c");
  return (
    <div className={`lp seo ${fontClasses}`} lang="en">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
      <header className="lp-nav lp-nav-solid">
        <Link href="/" className="lp-brand"><Logo size={28} /> <span>{SITE.name}</span></Link>
        <div><Link href="/#demo" className="lp-nav-in">Book a Demo</Link></div>
      </header>
      <main>
        <nav className="crumbs" aria-label="Breadcrumb"><Link href="/">Home</Link> / <span>{p.h1}</span></nav>
        <h1>{p.h1}</h1>
        <p className="seo-intro">{p.intro}</p>
        {p.sections.map(([h, t]) => <section key={h}><h2>{h}</h2><p>{t}</p></section>)}
        <div className="seo-lists">
          <section><h2>Available today</h2><ul>{p.available.map((a) => <li key={a}><Check size={16} /> {a}</li>)}</ul></section>
          <section><h2>Planned</h2><ul>{p.planned.map((a) => <li key={a}><Clock size={16} /> {a}</li>)}</ul></section>
        </div>
        <section><h2>Common questions</h2>{p.faqs.map(([q, a]) => <div key={q} className="seo-faq"><h3>{q}</h3><p>{a}</p></div>)}</section>
        <p><Link className="act" href="/#demo">Request a Personalised Demo <ArrowRight size={17} /></Link></p>
        <section className="seo-more"><h2>Related</h2><ul>{others.map(([s, o]) => <li key={s}><Link href={`/${s}`}>{o.h1}</Link></li>)}</ul></section>
      </main>
    </div>
  );
}
