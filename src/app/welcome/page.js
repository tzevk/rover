import Landing, { landingMetadata } from "@/components/landing/Landing";

// Served at "/" for visitors who aren't signed in (see src/proxy.js).
export const metadata = landingMetadata("en");

export default function Welcome() {
  return <Landing lang="en" />;
}
