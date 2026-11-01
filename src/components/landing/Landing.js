import Link from "next/link";
import Logo from "@/components/Logo";
import ContactLinks from "@/components/ContactLinks";
import SiteMenu from "./SiteMenu";
import { SITE } from "@/lib/site";
import { CONTENT } from "./content";
import { SEO_PAGES } from "./seo-pages";
import DemoForm from "./DemoForm";
import Touch from "./Touch";
import { fontClasses } from "./fonts";
import { MotionRoot } from "./Motion";
import "./landing.css";

export function landingMetadata(lang) {
  const c = CONTENT[lang];
  return {
    title: { absolute: c.title }, description: c.description, keywords: c.keywords,
    alternates: { canonical: c.path, languages: { en: "/", mr: "/mr", "x-default": "/" } },
    openGraph: { type: "website", url: c.path, siteName: SITE.name, title: c.title, description: c.description, locale: c.locale },
    twitter: { card: "summary_large_image", title: c.title, description: c.description },
    robots: { index: true, follow: true },
  };
}

// Facts only: no prices, ratings or review counts. Planned modules aren't listed as features.
function structuredData(c) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: SITE.name, url: SITE.url, logo: `${SITE.url}/icon.svg`, ...(SITE.email && { email: SITE.email }), ...(SITE.phone && { telephone: `+${SITE.phone}` }) },
      { "@type": "SoftwareApplication", name: `${SITE.name} Operations Software`, url: SITE.url, applicationCategory: "BusinessApplication", operatingSystem: "Web", description: c.description, inLanguage: ["en", "mr"], featureList: c.modules.filter((m) => m.status === "available").map((m) => m.name) },
    ],
  };
}

export default function Landing({ lang }) {
  const c = CONTENT[lang];
  const json = JSON.stringify(structuredData(c)).replace(/</g, "\\u003c");
  return (
    <MotionRoot>
      <div className={`lp ${fontClasses}`} lang={lang}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
        <header className="lp-nav">
          <Link href={c.path} className="lp-brand"><Logo size={28} /> <span>{lang === "mr" ? "आर.के. एंटरप्रायझेस" : SITE.name}</span></Link>
          <div>
            <a href="#modules" className="nav-wide">{c.nav.modules}</a>
            <Link href={c.nav.otherPath} hrefLang={c.nav.otherLang} lang={c.nav.otherLang} className="nav-wide">{c.nav.other}</Link>
            <Link href="/login" className="nav-wide">{c.nav.signIn}</Link>
            <a href="#demo" className="lp-nav-in">{c.nav.demo}</a>
            <SiteMenu labels={c.nav} links={[
              { href: "#modules", label: c.nav.modules },
              { href: c.nav.otherPath, label: c.nav.other, lang: c.nav.otherLang },
              { href: "/login", label: c.nav.signIn },
              { href: "#demo", label: c.nav.demo },
            ]} />
          </div>
        </header>

        <Touch touch={c.touch} headline={c.headline} cta={c.cta} descriptor={c.descriptor} />

        <div className="ground">
          <section id="modules" className="inside">
            <h2>{c.modulesTitle}</h2>
            <ol>
              {c.modules.filter((m) => m.also).map((m, i) => (
                <li key={m.name}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <h3>{m.name}</h3>
                  <p>{m.line}</p>
                </li>
              ))}
            </ol>
            <p className="fine">{c.roadmap}</p>
          </section>

          {c.who && (
            <section className="readers">
              <h2>{c.whoTitle}</h2>
              <ul>{c.who.map(([a, b]) => <li key={a}><h3>{a}</h3><p>{b}</p></li>)}</ul>
            </section>
          )}

          {c.why && <dl className="pledges">{c.why.map(([a, , b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>}

          <section id="demo" className="demo">
            <div><h2>{c.demo.title}</h2><p>{c.demo.text}</p></div>
            <DemoForm demo={c.demo} lang={lang} />
          </section>

          <footer className="lp-foot">
            <span>© {new Date().getFullYear()} {SITE.name}</span>
            <ContactLinks />
            <nav aria-label={c.capabilities}>{Object.entries(SEO_PAGES).map(([s, p]) => <Link key={s} href={`/${s}`}>{p.h1}</Link>)}</nav>
            <span><Link href="/terms">{c.legal[0]}</Link> · <Link href="/privacy">{c.legal[1]}</Link></span>
          </footer>
        </div>
      </div>
    </MotionRoot>
  );
}
