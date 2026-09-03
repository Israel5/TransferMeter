"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor } from "@/components/Editor";
import { TripList } from "@/components/TripList";
import { Calendar } from "@/components/Calendar";
import { Dashboard, type Run } from "@/components/Dashboard";
import { SettingsPanel } from "@/components/SettingsPanel";
import {
  initialState, loadQuote, newQuote, saveQuote, dedupeQuotes,
  type AppState,
} from "@/lib/state";
import { draftMessage } from "@/lib/message";
import { buildPDF } from "@/lib/pdf";
import { slugify, parseCoords } from "@/lib/quote";
import { PLACE_BY_NAME } from "@/lib/places";
import { cleanContact, waDigits, waLink } from "@/lib/whatsapp";
import { wordsFor } from "@/lib/words";
import { reminderMessage } from "@/lib/reminders";
import { buildMessage } from "@/lib/templates";
import { currentSession, signOut, pull, push, setQuoteStatus, fetchShareToken, clearLearned, removeQuote, rotateShareToken, signIn } from "@/lib/api";
import type { Lang, Quote, Settings, Stop, Trip } from "@/lib/types";

export default function Home() {
  const [st, setSt] = useState<AppState>(initialState);
  const [view, setView] = useState<"today" | "list" | "quote" | "calendar" | "settings">("today");
  // Closing a quote should return you where you opened it from, not always to
  // the trips list -- now that most days start on Today.
  const [cameFrom, setCameFrom] = useState<"today" | "list">("today");
  const [signedIn, setSignedIn] = useState(false);
  const [booted, setBooted] = useState(false);
  const live = true;   // the Maps proxy is always there
  const [store, setStore] = useState("This browser");
  const [flash, setFlash] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signInMsg, setSignInMsg] = useState<{ text: string; good?: boolean }>({ text: "" });

  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeSeq = useRef(0);
  const say = (t: string) => { setFlash(t); setTimeout(() => setFlash((f) => (f === t ? "" : f)), 3500); };

  /* ---------- boot: session, then data ---------- */
  useEffect(() => {
    (async () => {
      const here = await currentSession();
      setSignedIn(here);
      if (here) {
        try {
          const remote = await pull();
          if (remote) setSt((prev) => ({ ...prev, ...remote } as AppState));
          setStore("Synced");
        } catch { setStore("Not saved"); }
      }
      setBooted(true);
    })();
  }, []);

  /* ---------- persist ---------- */
  /** Save now and wait for it, for the actions that cannot proceed until the
   *  quote actually exists in the database. */
  const persistNow = useCallback(async (next: AppState) => {
    if (pushTimer.current) clearTimeout(pushTimer.current);
    if (!signedIn) return;
    setStore("Saving…");
    try {
      await push(next);
      setStore("Synced");
    } catch { setStore("Not saved"); throw new Error("Could not save that quote."); }
  }, [signedIn]);

  const persist = useCallback((next: AppState) => {
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(async () => {
      if (signedIn) {
        setStore("Saving…");
        try {
          const adopted = await push(next);
          // A customer corrected their counts while this was open; the save
          // kept their version, so the screen should show it too.
          if (adopted) {
            setSt((prev) => ({
              ...prev,
              quotes: prev.quotes.map((q) => adopted.find((a) => a.id === q.id) ?? q),
            }));
            say("A customer answered or updated their details — your list is up to date.");
          }
          setStore("Synced");
        }
        catch (e) { setStore("Not saved"); }
      }
    }, 600);
  }, [signedIn]);

  const set = useCallback((patch: Partial<AppState>) => {
    setSt((prev) => { const next = { ...prev, ...patch }; persist(next); return next; });
  }, [persist]);

  const setTrip = useCallback((i: number, patch: Partial<Trip>) => {
    setSt((prev) => {
      const trips = prev.trips.map((t, n) => (n === i ? { ...t, ...patch } : t));
      const next = { ...prev, trips };
      persist(next);
      return next;
    });
  }, [persist]);

  /* ---------- Google distances ---------- */
  const wantRoutes = useMemo(
    () => JSON.stringify(st.trips.map((t) => [t.stops, t.date, t.time])),
    [st.trips],
  );
  useEffect(() => {
    if (!booted || !live) return;
    if (routeTimer.current) clearTimeout(routeTimer.current);
    routeTimer.current = setTimeout(async () => {
      const seq = ++routeSeq.current;
      const results: (Trip["liveLegs"])[] = [];
      for (const trip of st.trips) {
        const payload = trip.stops.map((s) => {
          if (s.placeId) return { placeId: s.placeId };
          if (s.base) return st.settings.homeName ? { address: st.settings.homeName }
                                                  : { lat: st.settings.homeLat, lng: st.settings.homeLng };
          const raw = String(s.name ?? "").trim();
          if (!raw) return null;
          const hit = PLACE_BY_NAME.get(raw.toLowerCase());
          if (hit) return { lat: hit.lat, lng: hit.lng };
          const c = parseCoords(raw);
          return c ? { lat: c.lat, lng: c.lng } : { address: raw };
        });
        if (payload.some((p) => !p)) { results.push(null); continue; }
        let departureTime: string | null = null;
        if (trip.date && trip.time) {
          const at = new Date(`${trip.date}T${trip.time}`);
          if (!Number.isNaN(at.getTime()) && at.getTime() > Date.now() + 60000) departureTime = at.toISOString();
        }
        try {
          const r = await fetch("/api/route", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stops: payload, departureTime }),
          });
          const d = await r.json();
          results.push(r.ok ? d.legs : null);
        } catch { results.push(null); }
      }
      if (seq !== routeSeq.current) return;
      setSt((prev) => ({ ...prev, trips: prev.trips.map((t, i) => ({ ...t, liveLegs: results[i] ?? t.liveLegs })) }));
    }, 450);
  }, [wantRoutes, booted, live, st.settings.homeName, st.settings.homeLat, st.settings.homeLng]);

  /* ---------- maps hand-off ---------- */
  const mapsQuery = (s: Stop) => {
    if (s.base) return st.settings.homeName || `${st.settings.homeLat},${st.settings.homeLng}`;
    const raw = String(s.name ?? "").trim();
    if (!raw) return null;
    const hit = PLACE_BY_NAME.get(raw.toLowerCase());
    if (hit) return `${hit.lat},${hit.lng}`;
    const c = parseCoords(raw);
    return c ? `${c.lat},${c.lng}` : raw;
  };
  const trip = st.trips[st.active] ?? st.trips[0];
  const mapsLeg = (i: number) => {
    const a = mapsQuery(trip.stops[i]), b = mapsQuery(trip.stops[i + 1]);
    if (!a || !b) return null;
    return `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${encodeURIComponent(a)}&destination=${encodeURIComponent(b)}`;
  };
  const mapsRoute = () => {
    const qs = trip.stops.map(mapsQuery);
    if (qs.length < 2 || qs.some((q) => !q)) return null;
    const mid = qs.slice(1, -1).map((q) => encodeURIComponent(q!)).join("%7C");
    return `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${encodeURIComponent(qs[0]!)}&destination=${encodeURIComponent(qs[qs.length - 1]!)}${mid ? `&waypoints=${mid}` : ""}`;
  };

  /* ---------- actions ---------- */
  const doSave = () => {
    const r = saveQuote(st);
    if (!r.ok) { say(r.message); return; }
    setSt(r.state); persist(r.state);
    say(r.created ? `Saved as ${r.quote.quoteNo}.` : `Quote ${r.quote.quoteNo} updated.`);
  };

  const patchQuote = (id: string, patch: Partial<Quote>) => {
    setSt((prev) => {
      const next = { ...prev, quotes: prev.quotes.map((q) => (q.id === id ? { ...q, ...patch } : q)) };
      persist(next); return next;
    });
    // A status change is its own write: saves no longer carry one, so that
    // nothing can undo an answer by accident and nothing can stop you undoing
    // one on purpose.
    if (patch.status && signedIn) {
      setQuoteStatus(id, patch.status).catch(() => setStore("Not saved"));
    }
  };

  const doDelete = async (id: string) => {
    setSt((prev) => { const next = { ...prev, quotes: prev.quotes.filter((q) => q.id !== id) }; persist(next); return next; });
    if (signedIn) {
      try { await removeQuote(id); }
      catch { setStore("Not saved"); say("That quote could not be deleted — it will come back when you reload."); }
    }
  };

  const savePdf = (q: Quote) => {
    const bytes = buildPDF(q, st.settings);
    const name = ["transfer", slugify(q.quoteNo), slugify(q.customer, "quote")].filter(Boolean).join("-") + ".pdf";
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    say("PDF downloaded.");
  };

  /** Sending is what makes a quote sent; the status should not rely on memory. */
  const markSent = (q: Quote) => {
    const st = q.status ?? "draft";
    if (st === "draft" || st === "requested") patchQuote(q.id, { status: "sent" });
  };

  /** The address a customer opens, and whether it can reach them at all.
   *  A token addresses the quote in the database so their answer writes back;
   *  without one — no backend — the quote itself travels in the link. */
  const customerLinkFor = (q: Quote) => {
    const base = (st.settings.customerPage ?? "").trim().replace(/[#?].*$/, "")
      || `${location.origin}/quote`;
    const isPrivate = /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\]|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(base);
    // Without a token the link opens an empty page. Better to say so than to
    // hand over an address that quietly leads nowhere.
    return { link: `${base}#t=${q.shareToken ?? ""}`, isPrivate, usable: !!q.shareToken };
  };

  /** The quote as the database knows it, with the token its link needs. Saves
   *  first if the editor is holding unsaved work, because a link to a quote
   *  that was never stored is a link to nothing. */
  const linkable = async (q: Quote): Promise<Quote | null> => {
    if (q.shareToken) return q;

  if (!signedIn) { say("Sign in first — a customer link lives in the database."); return null; }
    try {
      const token = await fetchShareToken(q.id);
      if (!token) { say("That quote has not finished saving yet. Try again in a moment."); return null; }
      setSt((prev) => ({ ...prev,
        quotes: prev.quotes.map((x) => (x.id === q.id ? { ...x, shareToken: token } : x)) }));
      return { ...q, shareToken: token };
    } catch (e) { say((e as Error).message); return null; }
  };

  /** Retire the link that was sent and issue a new address for this quote.
   *  Anyone still holding the old one gets nothing, including the customer,
   *  so the replacement has to be sent again. */
  const revokeLink = async (q: Quote) => {
    if (!signedIn || !q.shareToken) {
      say("Nothing to revoke — this quote has no link yet.");
      return;
    }
    try {
      const token = await rotateShareToken(q.id);
      setSt((prev) => ({ ...prev, quotes: prev.quotes.map((x) => (x.id === q.id ? { ...x, shareToken: token } : x)) }));
      say("Old link disabled. Send or copy the new one.");
    } catch (e) {
      say((e as Error).message);
    }
  };

  /** Hand the link over for pasting anywhere — email, SMS, anything. */
  const copyLink = async (qIn: Quote) => {
    const q = await linkable(qIn);
    if (!q) return;
    const { link, isPrivate } = customerLinkFor(q);
    try {
      await navigator.clipboard.writeText(link);
      // Only count it as sent when the link could actually reach someone.
      if (!isPrivate) markSent(q);
      say(isPrivate
        ? "Copied — but this address only opens on this machine. Set your customer page address in Settings to copy public links."
        : "Link copied.");
    } catch {
      window.prompt("Copy this link for your customer:", link);
    }
  };

  /** Every editor action that acts on "this quote" has to save it first and
   *  keep what the save returned. Discarding it, as these used to, left the
   *  quote unstored, its number reusable, and its link pointing at nothing. */
  const saveThen = async (act: (q: Quote) => void | Promise<void>, needsDatabase = true) => {
    const r = saveQuote(st);
    if (!r.ok) { say(r.message); return; }
    setSt(r.state);
    if (needsDatabase) {
      try { await persistNow(r.state); } catch (e) { say((e as Error).message); return; }
    } else {
      persist(r.state);
    }
    await act(r.quote);
  };

  const remind = async (r: Run, kind: "before" | "onway", lang: Lang) => {
    const q = await linkable(r.quote);
    if (!q) return;
    const { link, isPrivate } = customerLinkFor(q);
    if (isPrivate) {
      say("Not from here — this link only opens on this machine. Use Copy link to try it, or set your customer page address in Settings.");
      return;
    }

    const body = reminderMessage(kind, q, r.trip, link, st.settings, lang);
    const wa = waLink(q.contact, body, st.settings);
    if (wa) window.open(wa, "_blank", "noopener");
    else {
      try { await navigator.clipboard.writeText(body); say("No WhatsApp for them — message copied instead."); }
      catch { window.prompt("Copy this message:", body); }
    }

    const stamp = new Date().toISOString();
    const trips = (q.trips ?? []).map((t, i) =>
      i === r.legIndex ? { ...t, [kind === "before" ? "remindedAt" : "onWayAt"]: stamp } : t);
    patchQuote(q.id, { trips });
  };

  const sendQuote = async (qIn: Quote) => {
    const q = await linkable(qIn);
    if (!q) return;
    const { link, isPrivate } = customerLinkFor(q);
    // The wording is the driver's to change; see Settings → Messages.
    const body = buildMessage("quote", q, (q.trips ?? [])[0], link, st.settings, q.lang);

    const wa = waLink(q.contact, body, st.settings);
    if (wa) {
      window.open(wa, "_blank", "noopener");
      markSent(q);
      say(isPrivate ? "Sent as a message — the approve page isn't public from here." : "Opening WhatsApp.");
      return;
    }

    // Nothing saved to address at all: open WhatsApp with the message written
    // and let the customer be chosen there.
    window.open(`https://wa.me/?text=${encodeURIComponent(body)}`, "_blank", "noopener");
    markSent(q);
    say("Opening WhatsApp — pick the customer, nothing is saved to address them.");
  };

  /* ---------- render ---------- */
  if (!booted) return <div className="wrap" />;


  if (!signedIn) {
    const go = async () => {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
        setSignInMsg({ text: "That doesn't look like an email address." }); return;
      }
      if (!password) { setSignInMsg({ text: "Enter your password." }); return; }
      setSignInMsg({ text: "Signing in…" });
      try {
        await signIn(email.trim(), password);
        setPassword("");
        location.reload();
      } catch (e) { setSignInMsg({ text: (e as Error).message }); }
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
          <p className={"msg" + (signInMsg.good ? " good" : signInMsg.text ? " bad" : "")}>{signInMsg.text}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header className="top">
        <h1 className="brand">Transfer <span>Meter</span></h1>
        <p className="tagline">Route, fuel and fare</p>
        <span className="top-spacer" />
        <div className="viewswitch">
          <button type="button" aria-pressed={view === "today"}
                  onClick={() => setView("today")}>Today</button>
          <button type="button" aria-pressed={view === "list" || view === "quote"}
                  onClick={() => setView("list")}>Trips</button>
          <button type="button" aria-pressed={view === "calendar"}
                  onClick={() => setView("calendar")}>Calendar</button>
          <button type="button" aria-pressed={view === "settings"}
                  onClick={() => setView("settings")}>Settings</button>
        </div>
        <span className={"mode" + (store === "Synced" ? " live" : "")}><span className="dot" />{store}</span>
        <span className={"mode" + (live ? " live" : "")}><span className="dot" />{live ? "Google live" : "Estimates"}</span>
      </header>

      {view === "list" && (
        <TripList quotes={st.quotes} settings={st.settings}
                  onOpen={(id) => {
                    const next = loadQuote(st, id); setSt(next); persist(next);
                    setCameFrom("list"); setView("quote");
                  }}
                  onDelete={doDelete} onPdf={savePdf} onSend={sendQuote} onCopyLink={copyLink}
                  onRevokeLink={revokeLink} onPatch={patchQuote}
                  onNew={() => {
                    const next = newQuote(st); setSt(next); persist(next);
                    setCameFrom("list"); setView("quote");
                  }} />
      )}

      {view === "quote" && (
        <Editor st={st} live={live} set={set} setTrip={setTrip}
                mapsLeg={mapsLeg} mapsRoute={mapsRoute}
                quoteText={draftMessage(st)}
                onSave={doSave}
                onSend={() => saveThen(sendQuote)}
                onPdf={() => saveThen(async (q) => savePdf(q), false)}
                onCopyLink={() => saveThen(copyLink)}
                onNewQuote={() => { const next = newQuote(st); setSt(next); persist(next); }}
                onBack={() => setView(cameFrom)}
                flash={flash} />
      )}

      {view === "today" && (
        <Dashboard quotes={st.quotes} settings={st.settings} learned={st.learned}
                   onRemind={remind}
                   onOpen={(id) => {
                     const next = loadQuote(st, id); setSt(next); persist(next);
                     setCameFrom("today"); setView("quote");
                   }} />
      )}

      {view === "calendar" && <Calendar quotes={st.quotes} settings={st.settings} onPatch={patchQuote} />}

      {view === "settings" && (
        <SettingsPanel settings={st.settings} learnedCount={Object.keys(st.learned).length}
                     quotes={st.quotes}
                     onChange={(patch) => set({ settings: { ...st.settings, ...patch } })}
                     onClearLearned={() => {
                       set({ learned: {} });
                       if (signedIn) {
                         clearLearned()
                           .catch(() => say("Those distances could not be forgotten — they will return on reload."));
                       }
                     }}
                     onSignOut={async () => {
                       try { await signOut(); } catch { /* the cookie goes either way */ }
                       // A full reload, so nothing of the signed-in screen is
                       // left behind in memory after the session is gone.
                       location.reload();
                     }} />
      )}
    </div>
  );
}
