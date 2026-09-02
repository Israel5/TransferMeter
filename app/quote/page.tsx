"use client";

import { useEffect, useState } from "react";
import { decodePayload } from "@/lib/message";

/* The quote travels inside the link. This page stores nothing and knows nothing
   on its own — open it without a link and there is simply no quote. */

type Leg = { k: string; d: string; h: string; s: string[]; m: number[]; km: number; mn: number; pr: number };
type Payload = {
  b?: string; p?: string; w?: string; n?: string; c?: string;
  l?: "pt" | "en" | "fr";
  t?: Leg[]; x?: { pax?: string; gear?: string; bags?: string }; tot?: number;
};

const T = {
  pt: { title: "Orçamento de transfer", forWhom: "Preparado para", quote: "Orçamento nº",
        out: "Ida", ret: "Volta", at: "às", total: "Total",
        pax: "Passageiros", gear: "Cadeirinhas", bags: "Bagagem",
        ask: "Está tudo certo com este orçamento?", yes: "Aprovar", no: "Recusar",
        foot: "Ao tocar num botão abre o WhatsApp com a resposta pronta — é só enviar.",
        okMsg: "Olá! Aprovo o orçamento", noMsg: "Olá! Infelizmente não vou seguir com o orçamento",
        none: "Nenhum orçamento neste link", noneSub: "Peça um novo link ao seu motorista." },
  en: { title: "Transfer quote", forWhom: "Prepared for", quote: "Quote no.",
        out: "Outbound", ret: "Return", at: "at", total: "Total",
        pax: "Passengers", gear: "Child seats", bags: "Luggage",
        ask: "Does this quote look right?", yes: "Approve", no: "Decline",
        foot: "Tapping a button opens WhatsApp with your reply ready — just send it.",
        okMsg: "Hello! I approve quote", noMsg: "Hello! I won't be going ahead with quote",
        none: "No quote in this link", noneSub: "Ask your driver for a new link." },
  fr: { title: "Devis de transfert", forWhom: "Préparé pour", quote: "Devis nº",
        out: "Aller", ret: "Retour", at: "à", total: "Total",
        pax: "Passagers", gear: "Sièges enfant", bags: "Bagages",
        ask: "Ce devis vous convient-il ?", yes: "Approuver", no: "Refuser",
        foot: "Le bouton ouvre WhatsApp avec votre réponse prête — il suffit de l'envoyer.",
        okMsg: "Bonjour ! J'approuve le devis", noMsg: "Bonjour ! Je ne donnerai pas suite au devis",
        none: "Aucun devis dans ce lien", noneSub: "Demandez un nouveau lien à votre chauffeur." },
};

const money = (n: number) => "$" + Number(n ?? 0).toLocaleString("en-CA", { maximumFractionDigits: 0 });
const km = (n: number) => Number(n ?? 0).toLocaleString("en-CA", { maximumFractionDigits: 1 }) + " km";
function dur(mins: number) {
  const m = Math.round(mins || 0), h = Math.floor(m / 60), r = m % 60;
  return h > 0 ? `${h} h ${String(r).padStart(2, "0")}` : `${m} min`;
}
function niceDate(iso: string, lang: string) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-");
  if (!y || !m || !d) return iso;
  return lang === "en" ? iso : `${d}/${m}/${y}`;
}

export default function CustomerQuote() {
  const [q, setQ] = useState<Payload | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const read = () => {
      try {
        const m = window.location.hash.replace(/^#/, "").match(/(?:^|&)q=([^&]+)/);
        setQ(m ? (decodePayload(m[1]) as Payload) : null);
      } catch { setQ(null); }
      setReady(true);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  if (!ready) return <div className="wrap" />;

  const L = T[q?.l ?? "pt"] ?? T.pt;

  if (!q || !Array.isArray(q.t) || q.t.length === 0) {
    return (
      <div className="wrap">
        <div className="empty" style={{ marginTop: "20vh", textAlign: "center" }}>
          <h1 style={{ fontFamily: '"Barlow Condensed",sans-serif', textTransform: "uppercase",
                       letterSpacing: ".06em", color: "var(--ink)", fontSize: "1.3rem", margin: "0 0 8px" }}>
            {L.none}
          </h1>
          <p>{L.noneSub}</p>
        </div>
      </div>
    );
  }

  const reply = (text: string) => {
    const msg = `${text}${q.n ? ` ${q.n}` : ""}${q.c ? ` — ${q.c}` : ""}.`;
    return q.w ? `https://wa.me/${q.w}?text=${encodeURIComponent(msg)}`
               : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  };

  return (
    <div className="wrap" style={{ maxWidth: "33rem" }}>
      <div className="sheet">
        <div className="band">
          <p className="biz">{q.b || L.title}</p>
          {q.p && <p className="biz-sub">{q.p}</p>}
          {q.n && <div className="band-no"><small>{L.quote}</small>{q.n}</div>}
        </div>

        <div className="body">
          {q.c && (
            <div className="for">
              <div className="label">{L.forWhom}</div>
              <div className="who">{q.c}</div>
            </div>
          )}

          {q.t.map((leg, i) => (
            <div key={i} className="leg-card">
              <div className="leg-top">
                <span className="leg-when">
                  {(leg.k === "ret" ? L.ret : L.out)
                    + (leg.d ? `  ·  ${niceDate(leg.d, q.l ?? "pt")}` : "")
                    + (leg.h ? `  ·  ${L.at} ${leg.h}` : "")}
                </span>
                <span className="leg-fare">{money(leg.pr)} CAD</span>
              </div>
              {(leg.s ?? []).map((name, n) => (
                <div key={n} className="stop-line">
                  <span className="dot" />
                  <span className="name">{name}</span>
                  {n < leg.s.length - 1 && Number.isFinite(leg.m?.[n]) && (
                    <span className="km">{km(leg.m[n])}</span>
                  )}
                </div>
              ))}
              <div className="leg-foot">{`${km(leg.km)}  ·  ${dur(leg.mn)}`}</div>
            </div>
          ))}

          {(q.x?.pax || q.x?.gear || q.x?.bags) && (
            <div className="rows">
              {q.x?.pax && <div className="row"><span className="label">{L.pax}</span><span className="val">{q.x.pax}</span></div>}
              {q.x?.gear && <div className="row"><span className="label">{L.gear}</span><span className="val">{q.x.gear}</span></div>}
              {q.x?.bags && <div className="row"><span className="label">{L.bags}</span><span className="val">{q.x.bags}</span></div>}
            </div>
          )}

          <div className="total">
            <span className="label">{L.total}</span>
            <span className="amt">{money(q.tot ?? 0)}<small>CAD</small></span>
          </div>
        </div>
      </div>

      <div className="ask">
        <p>{L.ask}</p>
        <div className="choice">
          <a className="yes" href={reply(L.okMsg)} target="_blank" rel="noopener">{L.yes}</a>
          <a className="no" href={reply(L.noMsg)} target="_blank" rel="noopener">{L.no}</a>
        </div>
        <p className="note">{L.foot}</p>
      </div>
    </div>
  );
}
