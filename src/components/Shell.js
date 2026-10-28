"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenCheck, CalendarCheck, CalendarDays, ClipboardList, Contact, HardHat, History, Home, LogOut, Menu,
  PanelLeftClose, PanelLeftOpen, PlusCircle, Receipt, ShieldCheck, Truck, UserRound, Users, Wallet,
} from "lucide-react";
import Logo from "./Logo";
import NavProgress from "./NavProgress";
import { logout } from "@/app/actions/auth";
import { SIDEBAR_COOKIE } from "@/lib/ui-prefs";

const WORK = [
  { href: "/", label: "Home", short: "Home", icon: Home },
  { href: "/orders/new", label: "New order", short: "Book", icon: PlusCircle },
  { href: "/deliveries", label: "Pending deliveries", short: "Deliver", icon: Truck, count: "pending" },
  { href: "/expenses", label: "Expenses", short: "Expenses", icon: Receipt },
  { href: "/attendance", label: "Attendance", short: "Attend", icon: CalendarCheck },
];

const ADMIN = [
  { href: "/orders", label: "Order history", icon: ClipboardList },
  { href: "/customers", label: "Customers & balances", icon: Contact },
  { href: "/accounts", label: "Daily accounts", icon: BookOpenCheck },
  { href: "/payroll", label: "Payroll", icon: Wallet },
  { href: "/staff", label: "Staff & wages", icon: HardHat },
  { href: "/users", label: "Logins", icon: Users },
  { href: "/activity", label: "Activity log", icon: History },
];

function isActive(pathname, href) {
  if (href === "/") return pathname === "/";
  if (href === "/orders") return pathname === "/orders";
  return pathname === href || pathname.startsWith(`${href}/`);
}

// The nav item that owns the current page (longest matching prefix), for the header title.
function currentSection(pathname, items) {
  return items
    .filter((i) => (i.href === "/" ? pathname === "/" : pathname === i.href || pathname.startsWith(`${i.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export default function Shell({ user, appName, pendingCount, today, initialCollapsed = false, children }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  // Remembered in a cookie (not localStorage) so the server renders the right width — no flicker.
  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  }
  const items = user.role === "admin" ? [...WORK, ...ADMIN] : WORK;
  const section = currentSection(pathname, items) ?? WORK[0];
  const SectionIcon = section.icon;
  const initial = user.full_name.charAt(0).toUpperCase();
  const RoleIcon = user.role === "admin" ? ShieldCheck : UserRound;
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  // Every data table becomes stacked, labelled cards on phones: copy each column heading onto
  // its cells as data-label (CSS shows it). Re-runs whenever page content changes.
  useEffect(() => {
    const main = document.querySelector(".main");
    if (!main) return;
    const label = () => {
      main.querySelectorAll("table.table").forEach((table) => {
        const heads = [...table.querySelectorAll("thead th")].map((th) => th.textContent.trim());
        if (!heads.length) return;
        if (!table.classList.contains("table-cards")) table.classList.add("table-cards", "auto");
        table.querySelectorAll("tbody tr").forEach((tr) =>
          [...tr.children].forEach((td, i) => {
            if (heads[i] && !td.dataset.label) td.dataset.label = heads[i];
          }),
        );
      });
    };
    label();
    const observer = new MutationObserver(label);
    observer.observe(main, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const link = (item) => {
    const Icon = item.icon;
    return (
      <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined}
        className={`side-link${isActive(pathname, item.href) ? " active" : ""}`}>
        <Icon size={18} />
        <span className="side-label">{item.label}</span>
        {item.count === "pending" && pendingCount > 0 && <span className="count">{pendingCount}</span>}
      </Link>
    );
  };

  return (
    <div className="shell" data-open={open} data-collapsed={collapsed}>
      <NavProgress />
      <header className="topbar">
        <Logo size={30} />
        {appName}
        <span className="avatar avatar-sm" title={user.full_name}>{initial}</span>
        <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu size={22} />
        </button>
      </header>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <aside className="side">
        <Link href="/" className="side-brand" title={collapsed ? appName : undefined}>
          <Logo size={32} />
          <span className="side-label">{appName}</span>
        </Link>
        <button className="side-toggle" onClick={toggleSidebar}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
        <nav className="side-nav">
          {user.role === "admin" && <div className="side-group"><span className="side-label">Daily work</span></div>}
          {WORK.map(link)}
          {user.role === "admin" && (
            <>
              <div className="side-group"><span className="side-label">Owner</span></div>
              {ADMIN.map(link)}
            </>
          )}
        </nav>
        <div className="side-user">
          <span className="avatar">{initial}</span>
          <div className="who side-label">
            <strong>{user.full_name}</strong>
            <span><RoleIcon size={12} /> {user.role === "admin" ? "Owner · Admin" : "Staff · Worker"}</span>
          </div>
          <form action={logout}>
            <button className="icon-btn" aria-label="Sign out" title="Sign out">
              <LogOut size={18} />
            </button>
          </form>
        </div>
      </aside>

      <div className="workspace">
        <header className="apphead">
          <div className="apphead-section">
            <SectionIcon size={17} />
            <span>{section.label}</span>
          </div>
          <div className="apphead-right">
            <span className="chip"><CalendarDays size={15} /> {today}</span>
            {pathname !== "/orders/new" && (
              <Link href="/orders/new" className="btn btn-accent btn-sm"><PlusCircle size={15} /> New order</Link>
            )}
            <div className="apphead-user">
              <span className="avatar">{initial}</span>
              <div>
                <strong>{user.full_name}</strong>
                <span><RoleIcon size={12} /> {user.role === "admin" ? "Admin" : "Worker"}</span>
              </div>
            </div>
          </div>
        </header>
        <main className="main">
          {/* Keyed by route so each page plays its entrance animation; same-page refreshes don't. */}
          <div key={pathname} className="page-enter">{children}</div>
        </main>
      </div>

      <nav className="tabbar" aria-label="Quick navigation">
        {WORK.map(({ href, short, icon: Icon, count }) => (
          <Link key={href} href={href} className={`tab${isActive(pathname, href) ? " active" : ""}`}>
            <Icon size={21} />
            {short}
            {count === "pending" && pendingCount > 0 && <span className="count">{pendingCount}</span>}
          </Link>
        ))}
      </nav>
    </div>
  );
}
