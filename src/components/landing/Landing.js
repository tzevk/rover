import Link from "next/link";
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

const Tag = ({ c, s }) => <span className={`tag tag-${s}`}>{c.status[s]}</span>;

function Panel({ data, sample }) {
  return (
    <aside className="panel" aria-label={sample}>
      <strong>{data.head}</strong>
      <dl>{data.rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <small>{sample}</small>
    </aside>
  );
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
          {c.flow && (
            <section id="platform" className="block day">
              <p className="mono">{c.flow.kicker}</p>
              <h2>{c.flow.title}</h2>
              <p className="lead">{c.sub}</p>
              <div className="stops">
                {c.flow.stops.map((s, i) => (
                  <article key={s.name} className="stop">
                    <p className="mono"><b>{String(i + 1).padStart(2, "0")}</b><Tag c={c} s={s.status} /></p>
                    <h3>{s.name}</h3>
                    <p className="stop-text">{s.text}</p>
                    <div className="record">
                      <strong>{s.record.head}</strong>
                      <dl>{s.record.rows.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>
                      <small>{c.sample}</small>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          <div className="ground">
            <p className="roadmap" id={c.flow ? undefined : "platform"}>{c.roadmap}</p>
            <section id="modules" className="block">
              <Rise inView><h2>{c.modulesTitle}</h2></Rise>
              <div className="modules">
                {c.modules.map((m) => (
                  <Rise inView key={m.name}>
                    <article className={`module module-${m.status}`}>
                      <div>
                        <Tag c={c} s={m.status} />
                        <h3>{m.name}</h3>
                        <p>{m.line}</p>
                        {m.points.length > 0 && <ul>{m.points.map((p) => <li key={p}>{p}</li>)}</ul>}
                      </div>
                      {m.panel && c.panels && <Panel data={c.panels[m.panel]} sample={c.sample} />}
                    </article>
                  </Rise>
                ))}
              </div>
            </section>

            {c.intel && (
              <section className="block">
                <Rise inView><h2>{c.intel.title}</h2><p className="lead">{c.intel.text}</p></Rise>
                <div className="intel">
                  <div className="panel">
                    <strong>{c.intel.nowHead} <Tag c={c} s="available" /></strong>
                    <dl>{c.intel.now.map(([a, b, v]) => <div key={a}><dt>{a}<br /><em>{b}</em></dt><dd>{v}</dd></div>)}</dl>
                    <small>{c.sample}</small>
                  </div>
                  <div className="panel">
                    <strong>{c.intel.soonHead} <Tag c={c} s="available" /></strong>
                    <ul>{c.intel.soon.map((s) => <li key={s}>{s}</li>)}</ul>
                    {c.intel.later && <small>{c.intel.later}</small>}
                  </div>
                </div>
              </section>
            )}

            {c.who && (
              <section className="block">
                <Rise inView><h2>{c.whoTitle}</h2><p className="lead">{c.whoNote}</p></Rise>
                <dl className="who">{c.who.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>
              </section>
            )}

            {c.why && (
              <section className="block">
                <Rise inView><h2>{c.whyTitle}</h2></Rise>
                <dl className="why">{c.why.map(([a, s, b]) => <div key={a}><dt>{a} <Tag c={c} s={s} /></dt><dd>{b}</dd></div>)}</dl>
              </section>
            )}

            <section id="demo" className="block demo">
              <Rise inView><h2>{c.demo.title}</h2><p className="lead">{c.demo.text}</p></Rise>
              <DemoForm demo={c.demo} lang={lang} />
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
