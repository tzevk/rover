import Landing, { landingMetadata } from "@/components/landing/Landing";

export const metadata = landingMetadata("mr");

export default function WelcomeMarathi() {
  return <Landing lang="mr" />;
}
