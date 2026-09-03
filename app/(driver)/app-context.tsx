"use client";

import { createContext, useContext } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor } from "@/components/Editor";
import { TripList } from "@/components/TripList";
import { Calendar } from "@/components/Calendar";

import { SettingsPanel } from "@/components/SettingsPanel";
import {
  initialState, loadQuote, newQuote, saveQuote, withQuote,
  type AppState,
} from "@/lib/state";
import { draftMessage, customerPayload } from "@/lib/message";
import { buildPDF } from "@/lib/pdf";
import { slugify, parseCoords } from "@/lib/quote";
import { PLACE_BY_NAME } from "@/lib/places";
import { cleanContact, waDigits, waLink } from "@/lib/whatsapp";
import { wordsFor } from "@/lib/words";
import { reminderMessage } from "@/lib/reminders";
import type { Run } from "@/components/Dashboard";
import { buildMessage } from "@/lib/templates";
import { currentSession, signOut, pull, push, saveQuoteToServer, setQuoteStatus, fetchShareToken, clearLearned, removeQuote, rotateShareToken, signIn } from "@/lib/api";
import type { Lang, Quote, Settings, Stop, Trip } from "@/lib/types";


/* The driver's app, held in one place so that moving between pages does not
 * throw away what is on screen.
 *
 * Every page under this provider reads the same state and calls the same
 * actions. The URL says which page you are looking at; it does not say what is
 * in it, and reloading one should not mean fetching everything again.
 */

type App = ReturnType<typeof useAppState>;

const Ctx = createContext<App | null>(null);

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppProvider");
  return v;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  return <Ctx.Provider value={useAppState()}>{children}</Ctx.Provider>;
}

function useAppState() {
  const [st, setSt] = useState<AppState>(initialState);
  const [signedIn, setSignedIn] = useState(false);
  const [booted, setBooted] = useState(false);
  const live = true;   // the Maps proxy is always there
  const [store, setStore] = useState("Backing up…");
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
          setStore("Work backed up");
        } catch { setStore("Backup failed"); }
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
    setStore("Backing up…");
    try {
      await push(next);
      setStore("Work backed up");
    } catch { setStore("Backup failed"); throw new Error("Could not save that quote."); }
  }, [signedIn]);

  const persist = useCallback((next: AppState) => {
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(async () => {
      if (signedIn) {
        setStore("Backing up…");
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
          setStore("Work backed up");
        }
        catch (e) { setStore("Backup failed"); }
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

  /** Read everything again, for when the database has moved underneath us. */
  const refresh = useCallback(async () => {
    try {
      const remote = await pull();
      if (remote) setSt((prev) => ({ ...prev, ...remote } as AppState));
      setStore("Work backed up");
    } catch { setStore("Backup failed"); }
  }, []);

  /* ---------- actions ---------- */
  /** Save, and take back what the database now holds -- including the number,
   *  which it issues from the id and nothing here can guess. */
  const saveNow = async (): Promise<Quote | null> => {
    const r = saveQuote(st);
    if (!r.ok) { say(r.message); return null; }
    setStore("Backing up…");
    try {
      const saved = await saveQuoteToServer(r.content, st.settings, r.editing?.id);
      setSt((prev) => withQuote(prev, saved));
      setStore("Work backed up");
      say(r.editing ? `Quote ${saved.quoteNo} updated.` : `Saved as ${saved.quoteNo}.`);
      return saved;
    } catch (e) {
      setStore("Backup failed");
      say((e as Error).message);
      return null;
    }
  };



  const patchQuote = (id: number, patch: Partial<Quote>) => {
    setSt((prev) => {
      const next = { ...prev, quotes: prev.quotes.map((q) => (q.id === id ? { ...q, ...patch } : q)) };
      persist(next); return next;
    });
    // A status change is its own write: saves no longer carry one, so that
    // nothing can undo an answer by accident and nothing can stop you undoing
    // one on purpose.
    if (patch.status && signedIn) {
      setQuoteStatus(id, patch.status).catch(() => setStore("Backup failed"));
    }
  };

  const doDelete = async (id: number) => {
    setSt((prev) => { const next = { ...prev, quotes: prev.quotes.filter((q) => q.id !== id) }; persist(next); return next; });
    if (signedIn) {
      try { await removeQuote(id); }
      catch { setStore("Backup failed"); say("That quote could not be deleted — it will come back when you reload."); }
    }
  };

  const savePdf = (q: Quote) => {
    // The same view the customer's page is given, so the document cannot
    // contain anything their page would not.
    const bytes = buildPDF(customerPayload(q, st.settings, (v: string) => waDigits(v, st.settings)));
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
    return { link: `${base}/${q.shareToken ?? ""}`, isPrivate, usable: !!q.shareToken };
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
  const saveThen = async (act: (q: Quote) => void | Promise<void>) => {
    const saved = await saveNow();
    if (saved) await act(saved);
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

  /** Ask, politely, about a trip already driven and not yet paid. */
  const nudge = async (r: Run, lang: Lang) => {
    const q = await linkable(r.quote);
    if (!q) return;
    const { link, isPrivate } = customerLinkFor(q);
    const body = buildMessage("owed", q, r.trip, isPrivate ? "" : link, st.settings, lang);
    const wa = waLink(q.contact, body, st.settings);
    if (wa) window.open(wa, "_blank", "noopener");
    else {
      try { await navigator.clipboard.writeText(body); say("No WhatsApp for them — message copied instead."); }
      catch { window.prompt("Copy this message:", body); }
    }
  };

  /** Paid, from the day's screen, without opening the quote to say so. */
  const markPaid = (r: Run) => {
    const trips = (r.quote.trips ?? []).map((t, i) => i === r.legIndex ? { ...t, paid: true } : t);
    patchQuote(r.quote.id, { trips });
    say(`${r.quote.customer || "That trip"} marked paid.`);
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


  return {
    st, setSt, set, setTrip, live, booted, signedIn, store, flash, say,
    email, setEmail, password, setPassword, signInMsg, setSignInMsg,
    persist, persistNow, mapsLeg, mapsRoute,
    saveNow, patchQuote, nudge, markPaid, doDelete, savePdf, sendQuote, remind,
    copyLink, revokeLink, customerLinkFor, refresh,
  };
}
