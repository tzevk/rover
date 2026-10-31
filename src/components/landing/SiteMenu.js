"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

// The website's menu on phones. Wider screens show the same links in the header.
export default function SiteMenu({ labels, links }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" className="site-menu-btn" aria-expanded={open} aria-controls="site-menu"
        aria-label={open ? labels.close : labels.open} onClick={() => setOpen(!open)}>
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>
      {open && (
        <nav id="site-menu" className="site-menu">
          {links.map((l) => (l.href.startsWith("#")
            ? <a key={l.href} href={l.href} onClick={() => setOpen(false)}>{l.label}</a>
            : <Link key={l.href} href={l.href} lang={l.lang} onClick={() => setOpen(false)}>{l.label}</Link>))}
        </nav>
      )}
    </>
  );
}
