// Shared building blocks so every screen has the same structure:
// PageHead → stat row → sections (Section = card with an icon header) → EmptyState.
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function PageHead({ icon: Icon, eyebrow, title, subtitle, children }) {
  return (
    <div className="page-head">
      <div className="page-title">
        {Icon && <span className="page-ico"><Icon size={22} /></span>}
        <div>
          {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
          <h1>{title}</h1>
          {subtitle && <p className="page-sub">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="row page-actions">{children}</div>}
    </div>
  );
}

export function Section({ icon: Icon, title, subtitle, action, children, className = "", style }) {
  return (
    <section className={`card ${className}`} style={style}>
      {title && (
        <div className="card-head">
          <div className="card-title">
            {Icon && <span className="card-ico"><Icon size={17} /></span>}
            <div>
              <h2>{title}</h2>
              {subtitle && <p>{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function HeadLink({ href, children }) {
  return (
    <Link href={href} className="head-link">
      {children} <ArrowRight size={14} />
    </Link>
  );
}

export function Stat({ icon: Icon, label, value, hint, accent = false, tone }) {
  return (
    <div className={`card stat${accent ? " accent" : ""}`}>
      <div className="label">
        {Icon && <span className={`stat-ico${tone ? ` tone-${tone}` : ""}`}><Icon size={16} /></span>}
        {label}
      </div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="empty">
      {Icon && <span className="empty-ico"><Icon size={24} /></span>}
      {title && <strong>{title}</strong>}
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}
