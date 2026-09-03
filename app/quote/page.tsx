"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CustomerQuote } from "./customer-quote";

/** Where links sent before the address changed still land.
 *
 *  The token used to travel in the fragment — /quote#t=… — which never leaves
 *  the browser. Those links are out in the world and have to keep working, so
 *  this reads the fragment and moves to the real address. */
export default function QuoteFromFragment() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = window.location.hash.replace(/^#/, "").match(/(?:^|&)t=([^&]+)/)?.[1] ?? "";
    if (t) router.replace(`/quote/${encodeURIComponent(t)}`);
    else setToken("");
  }, [router]);

  if (token === null) return <div className="wrap" />;
  return <CustomerQuote token="" />;
}
