import { pageTitle } from "@/lib/i18n/server";
import GateApp from "./GateApp";

export const generateMetadata = pageTitle("gate.title");

// Holds no data: everything on this screen comes from the device, so it can open with no connection.
export default function GatePage() {
  return <GateApp />;
}
