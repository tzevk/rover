import { cache } from "react";
import { cookies } from "next/headers";
import { cached, TAGS } from "./cache";
import { query } from "./db";
import { SITE_COOKIE } from "./ui-prefs";

export const getSites = (companyId) =>
  cached(`sites:${companyId}`, { tags: [TAGS.sites], ttl: 300 }, () => query("SELECT * FROM sites WHERE company_id = ? ORDER BY active DESC, id", [companyId]));

// The first site ever added holds the opening stock.
const isMain = (site, sites) => site.id === Math.min(...sites.map((s) => s.id));

// Where this person is working now: a login pinned to a site stays there; anyone else picks one.
// With one site this is simply that site, and nobody ever sees the choice.
export const currentSite = cache(async (user) => {
  const sites = await getSites(user.company_id);
  const active = sites.filter((s) => s.active);
  const wanted = user.site_id ?? Number((await cookies()).get(SITE_COOKIE)?.value);
  const site = active.find((s) => s.id === wanted) ?? active[0] ?? sites[0];
  return { ...site, main: isMain(site, sites) };
});

export const withMain = (sites) => sites.map((s) => ({ ...s, main: isMain(s, sites) }));
