import en from "@/lib/i18n/en";

// Lets the app be installed to a phone's home screen and open like a native app.
export default function manifest() {
  return {
    name: en["app.name"],
    short_name: "R.K.",
    description: en["meta.description"],
    start_url: "/",
    display: "standalone",
    background_color: "#f5f4ef",
    theme_color: "#f5f4ef",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
