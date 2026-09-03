"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppProvider, useApp } from "./app-context";
import { signIn } from "@/lib/api";
import { useState } from "react";

/* Everything behind the sign-in shares this: one header, one copy of the
   state, and a URL that says where you are. */

const TABS = [
  { href: "/today", label: "Today" },
  { href: "/trips", label: "Trips" },
  { href: "/calendar", label: "Calendar" },
  { href: "/settings", label: "Settings" },
];

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const go = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setMsg("That doesn't look like an email address."); return;
    }
    if (!password) { setMsg("Enter your password."); return; }
    setMsg("Signing in…");
    try {
      await signIn(email.trim(), password);
      setPassword("");
      location.reload();
    } catch (e) { setMsg((e as Error).message); }
  };

  return (
    <div className="wrap">
      <div className="signin">
        <h2>Transfer Meter</h2>
        <p>Sign in to see your trips.</p>
        <input type="email" inputMode="email" autoComplete="username" placeholder="you@example.com"
               value={email} onChange={(e) => setEmail(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter") go(); }} />
        <input type="password" autoComplete="current-password" placeholder="Password"
               value={password} onChange={(e) => setPassword(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter") go(); }} />
        <button className="btn primary" type="button" onClick={go}>Sign in</button>
        <p className={"msg" + (msg ? " bad" : "")}>{msg}</p>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { booted, signedIn, store, live, flash } = useApp();
  const path = usePathname();

  if (!booted) return <div className="wrap" />;
  if (!signedIn) return <SignIn />;

  return (
    <div className="wrap">
      <header className="top">
        <h1 className="brand">Transfer <span>Meter</span></h1>
        <p className="tagline">Route, fuel and fare</p>
        <span className="top-spacer" />
        <nav className="viewswitch">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href}
                  aria-current={path === t.href || path.startsWith(t.href + "/") ? "page" : undefined}>
              {t.label}
            </Link>
          ))}
        </nav>
        <span className={"mode" + (store === "Synced" ? " live" : "")}><span className="dot" />{store}</span>
        <span className={"mode" + (live ? " live" : "")}><span className="dot" />{live ? "Google live" : "Estimates"}</span>
      </header>

      {children}

      <div className={"flash" + (flash ? " on" : "")} role="status">{flash}</div>
    </div>
  );
}

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <Shell>{children}</Shell>
    </AppProvider>
  );
}
