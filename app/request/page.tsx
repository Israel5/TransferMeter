"use client";

import { useEffect, useRef, useState } from "react";
// The "min" metadata: formats and validates every country without shipping the
// full carrier and geocoding tables, which are several times larger and of no
// use to a form that only needs a reachable number.
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input/min";
import "react-phone-number-input/style.css";

/* The page a customer lands on to ask for a transfer.
 *
 * It quotes nothing. Distance, traffic and the price band are the driver's to
 * work out, and doing it here would mean a public page spending Google credit
 * for anyone who opens it. So this collects what the driver needs in order to
 * answer, and hands back a link the customer can watch for that answer.
 */

type Counts = Record<string, number>;

const T = {
  pt: {
    title: "Peça seu orçamento", sub: "Um minutinho pra preencher e eu te mando o preço.",
    who: "Seus dados", name: "Nome", contact: "Onde eu te encontro",
    trip: "A viagem", from: "Onde eu te busco", to: "Pra onde você vai",
    date: "Data", time: "Horário", ret: "Também vou precisar da volta",
    retDate: "Data da volta", retTime: "Horário da volta",
    people: "Quem vai viajar", pax: "Passageiros", gear: "Cadeirinhas", bags: "Bagagem",
    note: "Mais alguma coisa?", notePh: "Número do voo, ponto de encontro, o que for útil…",
    send: "Pedir orçamento", sending: "Enviando…",
    okTitle: "Pedido enviado", okBody: "Vou calcular o preço e já te retorno. Guarde este link pra acompanhar:",
    copy: "Copiar link", copied: "Copiado",
    needName: "Me diz seu nome, por favor.", needContact: "Preciso de um jeito de te responder.",
    needFrom: "Onde eu te busco?", needTo: "Pra onde você vai?",
    needHuman: "Confirme que você não é um robô.",
    how: "Como falo com você?", byPhone: "Telefone", byHandle: "Usuário",
    badPhone: "Esse número parece incompleto.",
    adults: "Adultos", children: "Crianças", infants: "Bebês",
    infantSeat: "Bebê conforto", carSeat: "Cadeirinha", booster: "Assento de elevação",
    checked: "Malas", carry: "Bagagem de mão", backpack: "Mochilas",
    stroller: "Carrinho de bebê", crib: "Berço portátil", other: "Outros itens",
  },
  en: {
    title: "Ask for a quote", sub: "A minute to fill in, and I'll send you the price.",
    who: "About you", name: "Name", contact: "How to reach you",
    trip: "The journey", from: "Where I collect you", to: "Where you're going",
    date: "Date", time: "Time", ret: "I'll need a return trip too",
    retDate: "Return date", retTime: "Return time",
    people: "Who's travelling", pax: "Passengers", gear: "Child seats", bags: "Luggage",
    note: "Anything else?", notePh: "Flight number, where to meet, anything useful…",
    send: "Ask for a quote", sending: "Sending…",
    okTitle: "Request sent", okBody: "I'll work out the price and get back to you. Keep this link to follow it:",
    copy: "Copy link", copied: "Copied",
    needName: "Please tell me your name.", needContact: "I need a way to reply to you.",
    needFrom: "Where should I collect you?", needTo: "Where are you going?",
    needHuman: "Please confirm you're not a robot.",
    how: "How should I reach you?", byPhone: "Phone", byHandle: "Username",
    badPhone: "That number looks incomplete.",
    adults: "Adults", children: "Children", infants: "Babies",
    infantSeat: "Infant seat", carSeat: "Car seat", booster: "Booster",
    checked: "Suitcases", carry: "Carry-ons", backpack: "Backpacks",
    stroller: "Stroller", crib: "Travel crib", other: "Other items",
  },
  fr: {
    title: "Demandez votre devis", sub: "Une minute à remplir, et je vous envoie le prix.",
    who: "Vos coordonnées", name: "Nom", contact: "Comment vous joindre",
    trip: "Le trajet", from: "Où je viens vous chercher", to: "Où vous allez",
    date: "Date", time: "Heure", ret: "J'aurai aussi besoin du retour",
    retDate: "Date du retour", retTime: "Heure du retour",
    people: "Qui voyage", pax: "Passagers", gear: "Sièges enfant", bags: "Bagages",
    note: "Autre chose ?", notePh: "Numéro de vol, point de rencontre, tout ce qui aide…",
    send: "Demander un devis", sending: "Envoi…",
    okTitle: "Demande envoyée", okBody: "Je calcule le prix et je vous réponds. Gardez ce lien pour suivre :",
    copy: "Copier le lien", copied: "Copié",
    needName: "Dites-moi votre nom.", needContact: "Il me faut un moyen de vous répondre.",
    needFrom: "Où dois-je venir vous chercher ?", needTo: "Où allez-vous ?",
    needHuman: "Confirmez que vous n'êtes pas un robot.",
    how: "Comment vous joindre ?", byPhone: "Téléphone", byHandle: "Nom d'utilisateur",
    badPhone: "Ce numéro semble incomplet.",
    adults: "Adultes", children: "Enfants", infants: "Bébés",
    infantSeat: "Siège bébé", carSeat: "Siège d'auto", booster: "Siège d'appoint",
    checked: "Valises", carry: "Bagages à main", backpack: "Sacs à dos",
    stroller: "Poussette", crib: "Lit parapluie", other: "Autres articles",
  },
};

const GROUPS: { key: "pax" | "gear" | "bags"; items: string[] }[] = [
  { key: "pax", items: ["adults", "children", "infants"] },
  { key: "gear", items: ["infantSeat", "carSeat", "booster"] },
  { key: "bags", items: ["checked", "carry", "backpack", "stroller", "crib", "other"] },
];

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
    };
  }
}

export default function RequestQuote() {
  const [lang, setLang] = useState<"pt" | "en" | "fr">("pt");
  const L = T[lang];

  const [name, setName] = useState("");
  // Two ways people are actually reachable on WhatsApp: a number, or a
  // username. The number is kept in its international form, which is what a
  // wa.me link wants and what survives being read in another country.
  const [contactBy, setContactBy] = useState<"phone" | "handle">("phone");
  const [phone, setPhone] = useState<string | undefined>(undefined);
  const [handle, setHandle] = useState("");
  const contact = contactBy === "phone" ? (phone ?? "") : (handle.trim() ? `@${handle.trim().replace(/^@+/, "")}` : "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [wantReturn, setWantReturn] = useState(false);
  const [retDate, setRetDate] = useState("");
  const [retTime, setRetTime] = useState("");
  const [note, setNote] = useState("");
  const [counts, setCounts] = useState<Record<string, Counts>>({
    pax: { adults: 2, children: 0, infants: 0 }, gear: {}, bags: {},
  });

  const [token, setToken] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const widget = useRef<HTMLDivElement | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  // The browser's own language is a better first guess than making them choose.
  useEffect(() => {
    const tag = (navigator.language || "").slice(0, 2).toLowerCase();
    if (tag === "en" || tag === "fr" || tag === "pt") setLang(tag);
  }, []);

  useEffect(() => {
    if (!siteKey || !widget.current || done) return;
    const el = widget.current;
    let cancelled = false;

    const draw = () => {
      if (cancelled || !window.turnstile || el.childElementCount) return;
      window.turnstile.render(el, {
        sitekey: siteKey,
        callback: (t: string) => setToken(t),
        "expired-callback": () => setToken(""),
        "error-callback": () => setToken(""),
      });
    };

    if (window.turnstile) { draw(); return; }
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true; s.defer = true;
    s.onload = draw;
    document.head.appendChild(s);
    return () => { cancelled = true; };
  }, [siteKey, done]);

  const bump = (grp: string, key: string, by: number) =>
    setCounts((c) => {
      const next = { ...c, [grp]: { ...(c[grp] ?? {}) } };
      next[grp][key] = Math.max(0, Math.min(20, (next[grp][key] ?? 0) + by));
      return next;
    });

  const submit = async () => {
    setError("");
    if (!name.trim()) return setError(L.needName);
    if (!contact.trim()) return setError(L.needContact);
    // A half-typed number is worse than none: it looks answered and reaches
    // nobody. The library knows each country's shape, so let it say.
    if (contactBy === "phone" && !isValidPhoneNumber(contact)) return setError(L.badPhone);
    if (!from.trim()) return setError(L.needFrom);
    if (!to.trim()) return setError(L.needTo);
    if (siteKey && !token) return setError(L.needHuman);

    setSending(true);
    try {
      const trips: unknown[] = [{ label: "Outbound", date, time, from: from.trim(), to: to.trim() }];
      if (wantReturn) {
        trips.push({ label: "Return", date: retDate, time: retTime, from: to.trim(), to: from.trim() });
      }
      const r = await fetch("/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          payload: {
            customer: name.trim(), contact: contact.trim(), lang,
            note: note.trim(), first_date: date || null, trips,
            pax: counts.pax, gear: counts.gear, bags: counts.bags,
          },
        }),
      });
      const said = await r.json().catch(() => null);
      if (!r.ok) {
        setError(said?.error || "That could not be sent. Please try again.");
        window.turnstile?.reset(); setToken("");
        return;
      }
      setDone(said?.token ? `${location.origin}/quote#t=${said.token}` : "");
    } catch {
      setError("That could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  };

  if (done !== null) {
    return (
      <div className="wrap cq">
        <article className="cq-sheet">
          <header className="cq-head">
            <div className="cq-head-main"><p className="cq-biz">{L.okTitle}</p></div>
          </header>
          <div className="cq-section">
            <p style={{ margin: "0 0 14px" }}>{L.okBody}</p>
            {done ? (
              <>
                <p className="rq-link">{done}</p>
                <button type="button" className="cq-btn solid"
                        onClick={async () => {
                          try { await navigator.clipboard.writeText(done); setCopied(true); }
                          catch { window.prompt(L.copy, done); }
                        }}>
                  {copied ? L.copied : L.copy}
                </button>
              </>
            ) : null}
          </div>
        </article>
      </div>
    );
  }

  return (
    <div className="wrap cq">
      <article className="cq-sheet">
        <header className="cq-head">
          <div className="cq-head-main">
            <p className="cq-biz">{L.title}</p>
            <p className="cq-biz-sub">{L.sub}</p>
          </div>
          <div className="rq-langs">
            {(["pt", "en", "fr"] as const).map((c) => (
              <button key={c} type="button" aria-pressed={lang === c}
                      onClick={() => setLang(c)}>{c.toUpperCase()}</button>
            ))}
          </div>
        </header>

        <section className="cq-section">
          <h2 className="cq-h">{L.who}</h2>
          <div className="rq-fields">
            <label className="rq-field">
              <span>{L.name}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
            <div className="rq-field">
              <span>{L.contact}</span>
              <div className="rq-toggle" role="group" aria-label={L.how}>
                <button type="button" aria-pressed={contactBy === "phone"}
                        onClick={() => setContactBy("phone")}>{L.byPhone}</button>
                <button type="button" aria-pressed={contactBy === "handle"}
                        onClick={() => setContactBy("handle")}>{L.byHandle}</button>
              </div>
              {contactBy === "phone" ? (
                <PhoneInput
                  international
                  defaultCountry="CA"
                  countryCallingCodeEditable={false}
                  value={phone}
                  onChange={setPhone}
                  autoComplete="tel" />
              ) : (
                <span className="rq-handle">
                  <span>@</span>
                  <input value={handle} autoComplete="off" spellCheck={false}
                         onChange={(e) => setHandle(e.target.value.replace(/^@+/, ""))} />
                </span>
              )}
            </div>
          </div>
        </section>

        <section className="cq-section">
          <h2 className="cq-h">{L.trip}</h2>
          <div className="rq-fields">
            <label className="rq-field wide">
              <span>{L.from}</span>
              <input value={from} onChange={(e) => setFrom(e.target.value)} autoComplete="off" />
            </label>
            <label className="rq-field wide">
              <span>{L.to}</span>
              <input value={to} onChange={(e) => setTo(e.target.value)} autoComplete="off" />
            </label>
            <label className="rq-field">
              <span>{L.date}</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="rq-field">
              <span>{L.time}</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
          </div>

          <label className="rq-check">
            <input type="checkbox" checked={wantReturn}
                   onChange={(e) => setWantReturn(e.target.checked)} />
            <span>{L.ret}</span>
          </label>

          {wantReturn && (
            <div className="rq-fields">
              <label className="rq-field">
                <span>{L.retDate}</span>
                <input type="date" value={retDate} onChange={(e) => setRetDate(e.target.value)} />
              </label>
              <label className="rq-field">
                <span>{L.retTime}</span>
                <input type="time" value={retTime} onChange={(e) => setRetTime(e.target.value)} />
              </label>
            </div>
          )}
        </section>

        <section className="cq-section">
          <h2 className="cq-h">{L.people}</h2>
          {GROUPS.map(({ key, items }) => (
            <div key={key} className="cq-group">
              <h3>{L[key]}</h3>
              {items.map((it) => (
                <div key={it} className="cq-count">
                  <span className="cq-item">{L[it as keyof typeof L]}</span>
                  <span className="cq-stepper">
                    <button type="button" aria-label={`Less ${L[it as keyof typeof L]}`}
                            disabled={(counts[key]?.[it] ?? 0) <= 0}
                            onClick={() => bump(key, it, -1)}>−</button>
                    <output>{counts[key]?.[it] ?? 0}</output>
                    <button type="button" aria-label={`More ${L[it as keyof typeof L]}`}
                            disabled={(counts[key]?.[it] ?? 0) >= 20}
                            onClick={() => bump(key, it, 1)}>+</button>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </section>

        <section className="cq-section">
          <h2 className="cq-h">{L.note}</h2>
          <textarea className="rq-note" rows={3} placeholder={L.notePh}
                    value={note} onChange={(e) => setNote(e.target.value)} />
        </section>

        <div className="cq-section" style={{ borderBottom: 0 }}>
          {siteKey && <div ref={widget} className="rq-turnstile" />}
          {error && <p className="cq-warn">{error}</p>}
          <button type="button" className="cq-btn solid rq-send" disabled={sending} onClick={submit}>
            {sending ? L.sending : L.send}
          </button>
        </div>
      </article>
    </div>
  );
}
