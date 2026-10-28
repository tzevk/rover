"use client";

import { useEffect, useRef, useState } from "react";

// A slim bar across the top that starts the moment an in-app link is clicked and completes
// when the new page has rendered. Purely visual: it never delays or alters navigation.
export default function NavProgress() {
  const [state, setState] = useState("idle"); // idle → loading → done → idle
  const startHref = useRef(null);

  useEffect(() => {
    function onClick(e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.("a[href]");
      if (!a || a.target || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.href === location.href) return;
      startHref.current = location.href;
      setState("loading");
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // After every render: once the address has changed, the new page is on screen.
  useEffect(() => {
    if (state === "loading" && location.href !== startHref.current) setState("done");
  });

  useEffect(() => {
    if (state === "done") {
      const t = setTimeout(() => setState("idle"), 450);
      return () => clearTimeout(t);
    }
    if (state === "loading") {
      const t = setTimeout(() => setState("done"), 12000); // never leave it hanging
      return () => clearTimeout(t);
    }
  }, [state]);

  return <div className="nav-progress" data-state={state} aria-hidden="true" />;
}
