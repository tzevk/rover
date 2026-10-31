// Cookies for per-browser preferences, read on the server so the first paint is already right (no flicker).
export const SIDEBAR_COOKIE = "rq_sidebar"; // "collapsed" | "open"
export const LANG_COOKIE = "rq_lang"; // "en" | "mr"
export const THEME_COOKIE = "rq_theme"; // "light" | "dark"; absent = follow the device
export const SITE_COOKIE = "rq_site"; // the site this browser is working at
export const FLASH_COOKIE = "rq_flash"; // one message to show after a one-click action

export const setPrefCookie = (name, value) => {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
};
