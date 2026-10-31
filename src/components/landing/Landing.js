import Image from "next/image";
import Link from "next/link";
import { Building2, FileOutput, History, Landmark, Languages, ShieldCheck, Truck, Users, WifiOff } from "lucide-react";
import Logo from "@/components/Logo";
import ContactLinks from "@/components/ContactLinks";
import SiteMenu from "./SiteMenu";
import { SITE } from "@/lib/site";
import { CONTENT } from "./content";
import { SEO_PAGES } from "./seo-pages";
import DemoForm from "./DemoForm";
import Experience from "./Experience";
import { fontClasses } from "./fonts";
import { MotionRoot, Rise } from "./Motion";
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

// Only what the journey at the top hasn't already shown.
const ALSO_ICONS = [Users, Truck, FileOutput, Building2, WifiOff, Landmark];
const WHY_ICONS = [History, ShieldCheck, Languages];
const WHO_IMAGES = ["motor-shop", "drill", "workshop", "shelves", "till", "parcel"];

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
            <a href="#platform" className="nav-wide">{c.nav.platform}</a>
            <a href="#modules" className="nav-wide">{c.nav.modules}</a>
            <Link href={c.nav.otherPath} hrefLang={c.nav.otherLang} lang={c.nav.otherLang} className="nav-wide">{c.nav.other}</Link>
            <Link href="/login" className="nav-wide">{c.nav.signIn}</Link>
            <a href="#demo" className="lp-nav-in">{c.nav.demo}</a>
            <SiteMenu labels={c.nav} links={[
              { href: "#platform", label: c.nav.platform },
              { href: "#modules", label: c.nav.modules },
              { href: c.nav.otherPath, label: c.nav.other, lang: c.nav.otherLang },
              { href: "/login", label: c.nav.signIn },
              { href: "#demo", label: c.nav.demo },
            ]} />
          </div>
        </header>

        <Experience descriptor={c.descriptor} headline={c.headline} sub={c.sub} cta={c.cta} journey={c.journey} sample={c.sample}>
          <div className="ground">
            <section id="modules" className="block">
              <Rise inView className="head">
                <h2>{c.modulesTitle}</h2>
                <p className="lead">{c.roadmap}</p>
              </Rise>
              <div className="also">
                {c.modules.filter((m) => m.also).map((m, i) => {
                  const Icon = ALSO_ICONS[i];
                  return (
                    <Rise inView delay={i * 0.06} key={m.name}>
                      <article className="also-card">
                        <span><Icon size={21} strokeWidth={1.7} /></span>
                        <h3>{m.name}</h3>
                        <p>{m.line}</p>
                      </article>
                    </Rise>
                  );
                })}
              </div>
            </section>

            {c.intel && (
              <section className="brief">
                <Rise inView className="brief-copy"><h2>{c.intel.title}</h2><p>{c.intel.text}</p></Rise>
                <Rise inView delay={0.12} className="brief-board">
                  <dl>{c.intel.now.map(([a, b, v]) => <div key={a}><dt>{a}<em>{b}</em></dt><dd>{v}</dd></div>)}</dl>
                  <ul>{c.intel.soon.map((s) => <li key={s}>{s}</li>)}</ul>
                  <small>{c.sample}</small>
                </Rise>
              </section>
            )}

            {c.who && (
              <section className="block">
                <Rise inView className="head"><h2>{c.whoTitle}</h2><p className="lead">{c.whoNote}</p></Rise>
                <div className="who">
                  {c.who.map(([a, b], i) => (
                    <Rise inView delay={(i % 3) * 0.06} key={a}>
                      <figure>
                        <Image src={`/shop/tiles/${WHO_IMAGES[i]}.webp`} alt="" fill sizes="(max-width: 800px) 100vw, 33vw" />
                        <figcaption><h3>{a}</h3><p>{b}</p></figcaption>
                      </figure>
                    </Rise>
                  ))}
                </div>
              </section>
            )}

            {c.why && (
              <section className="block">
                <Rise inView className="head"><h2>{c.whyTitle}</h2></Rise>
                <dl className="why">
                  {c.why.map(([a, , b], i) => {
                    const Icon = WHY_ICONS[i];
                    return <div key={a}><dt><Icon size={20} strokeWidth={1.7} />{a}</dt><dd>{b}</dd></div>;
                  })}
                </dl>
              </section>
            )}

            <section id="demo" className="demo">
              <div className="demo-in">
                <Rise inView className="demo-copy"><h2>{c.demo.title}</h2><p>{c.demo.text}</p></Rise>
                <DemoForm demo={c.demo} lang={lang} />
              </div>
            </section>

            <footer className="lp-foot">
              <span>© {new Date().getFullYear()} {SITE.name}</span>
              <ContactLinks />
              <nav aria-label={c.capabilities}>{Object.entries(SEO_PAGES).map(([s, p]) => <Link key={s} href={`/${s}`}>{p.h1}</Link>)}</nav>
              <span><Link href="/terms">{c.legal[0]}</Link> · <Link href="/privacy">{c.legal[1]}</Link></span>
            </footer>
          </div>
        </Experience>
      </div>
    </MotionRoot>
  );
}
