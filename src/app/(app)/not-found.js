import Link from "next/link";
import { Home, SearchX } from "lucide-react";
import { EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="card" style={{ maxWidth: 560, margin: "40px auto" }}>
      <EmptyState icon={SearchX} title="Not found">
        <p>That page or record doesn&apos;t exist, or you don&apos;t have access to it.</p>
        <Link href="/" className="btn btn-primary"><Home size={16} /> Go home</Link>
      </EmptyState>
    </div>
  );
}
