"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { FLASH_COOKIE } from "@/lib/ui-prefs";

export default function Flash({ message }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    document.cookie = `${FLASH_COOKIE}=; path=/; max-age=0`;
    const timer = setTimeout(() => setShown(false), 4500);
    return () => clearTimeout(timer);
  }, []);
  if (!shown) return null;
  return <div className="flash" role="status"><CheckCircle2 size={17} /> {message}</div>;
}
