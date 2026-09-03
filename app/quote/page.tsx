"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchQuoteByToken, answerQuote, updateQuoteCounts } from "@/lib/api";

/* What a customer sees. The link carries only a token; everything on the page
   comes from the row it unlocks, so a price changed after sending is the price
   they read. The driver's own address is never in it — their stops arrive
   already named by the part they play in the journey. */

type Leg = {
  k: string; d: string; h: string; s: string[]; m: number[];
  km: number; mn: number; pr: number;
  /** The part with the passenger aboard. Absent on links sent before this. */
  pkm?: number; pmn?: number;
};
type Counts = Record<string, number>;
type Payload = {
  b?: string; p?: string; w?: string; n?: string; c?: string;
  l?: "pt" | "en" | "fr";
  t?: Leg[];
  xc?: { pax?: Counts; gear?: Counts; bags?: Counts };
  seats?: number;
  tot?: number;
};

const GROUPS: { key: "pax" | "gear" | "bags"; items: string[] }[] = [
  { key: "pax", items: ["adults", "children", "infants"] },
  { key: "gear", items: ["infantSeat", "carSeat", "booster"] },
  { key: "bags", items: ["checked", "carry", "backpack", "stroller", "crib", "other"] },
];

/** Singular and plural, because "1 bags" is the sort of thing that makes a
 *  quote look careless. */
const ITEM: Record<string, Record<string, [string, string]>> = {
  pt: { adults: ["adulto", "adultos"], children: ["criança", "crianças"], infants: ["bebê", "bebês"],
        infantSeat: ["bebê conforto", "bebês conforto"], carSeat: ["cadeirinha", "cadeirinhas"],
        booster: ["assento de elevação", "assentos de elevação"], checked: ["mala", "malas"],
        carry: ["bagagem de mão", "bagagens de mão"],
        backpack: ["mochila", "mochilas"], stroller: ["carrinho de bebê", "carrinhos de bebê"],
        crib: ["berço portátil", "berços portáteis"], other: ["item", "itens"] },
  en: { adults: ["adult", "adults"], children: ["child", "children"], infants: ["baby", "babies"],
        infantSeat: ["infant seat", "infant seats"], carSeat: ["car seat", "car seats"],
        booster: ["booster", "boosters"], checked: ["suitcase", "suitcases"], carry: ["carry-on", "carry-ons"],
        backpack: ["backpack", "backpacks"], stroller: ["stroller", "strollers"],
        crib: ["travel crib", "travel cribs"], other: ["item", "items"] },
  fr: { adults: ["adulte", "adultes"], children: ["enfant", "enfants"], infants: ["bébé", "bébés"],
        infantSeat: ["siège bébé", "sièges bébé"], carSeat: ["siège d'auto", "sièges d'auto"],
        booster: ["siège d'appoint", "sièges d'appoint"], checked: ["valise", "valises"],
        carry: ["bagage à main", "bagages à main"], backpack: ["sac à dos", "sacs à dos"],
        stroller: ["poussette", "poussettes"], crib: ["lit parapluie", "lits parapluie"],
        other: ["article", "articles"] },
};

const T = {
  pt: {
    title: "Orçamento de transfer", forWhom: "Transfer de", quote: "Orçamento nº",
    out: "Ida", ret: "Volta", at: "às", total: "Total",
    pax: "Passageiros", gear: "Cadeirinhas", bags: "Bagagem",
    ask: "Tudo certo com o orçamento?", yes: "Aprovar", no: "Recusar",
    review: "Confira seus dados", edit: "Corrigir", done: "Salvar", cancel: "Cancelar",
    editHint: "Mudou alguma coisa? É só ajustar aqui que eu fico sabendo. O preço não muda.",
    saved: "Prontinho, dados atualizados!", saveFail: "Não consegui salvar. Tenta de novo?",
    seatsWarn: "Isso passa da quantidade de lugares do carro. Vou falar com você.",
    nothing: "Nada informado", none: "Nenhum orçamento neste link",
    noneSub: "Peça um link novo para o seu motorista.",
    thanksYes: "Obrigado! Sua viagem está confirmada.",
    thanksNo: "Tudo bem — já fiquei sabendo.",
    sending: "Enviando…", stops: "Trajeto",
    yourRide: "Sua viagem", totalDriven: "Total rodado pelo motorista",
    failed: "Não consegui registrar sua resposta. Tenta de novo?",
    lockedNote: "Você já respondeu este orçamento, então os dados estão fechados.",
    callDriver: "Precisa mudar alguma coisa? É só me chamar.",
    notReady: "Ainda estou montando este orçamento pra você.",
  },
  en: {
    title: "Transfer quote", forWhom: "Transfer for", quote: "Quote no.",
    out: "Outbound", ret: "Return", at: "at", total: "Total",
    pax: "Passengers", gear: "Child seats", bags: "Luggage",
    ask: "Does this all look right?", yes: "Approve", no: "Decline",
    review: "Check your details", edit: "Correct", done: "Save", cancel: "Cancel",
    editHint: "Something changed? Adjust it here and I'll know. The price stays the same.",
    saved: "Updated — thank you!", saveFail: "That didn't save. Please try again.",
    seatsWarn: "That's more seats than the car has. I'll be in touch.",
    nothing: "Nothing listed", none: "No quote in this link",
    noneSub: "Ask your driver for a new link.",
    thanksYes: "Thank you — your trip is confirmed.",
    thanksNo: "No problem — I've been told.",
    sending: "Sending…", stops: "Route",
    yourRide: "Your journey", totalDriven: "Total driven by the driver",
    failed: "That didn't go through. Please try again.",
    lockedNote: "You've already answered this quote, so the details are closed.",
    callDriver: "Need to change something? Just message me.",
    notReady: "I'm still putting this quote together for you.",
  },
  fr: {
    title: "Devis de transfert", forWhom: "Transfert pour", quote: "Devis nº",
    out: "Aller", ret: "Retour", at: "à", total: "Total",
    pax: "Passagers", gear: "Sièges enfant", bags: "Bagages",
    ask: "Est-ce que tout est correct ?", yes: "Approuver", no: "Refuser",
    review: "Vérifiez vos informations", edit: "Corriger", done: "Enregistrer", cancel: "Annuler",
    editHint: "Un changement ? Ajustez ici et je serai au courant. Le prix ne change pas.",
    saved: "C'est mis à jour, merci !", saveFail: "L'enregistrement n'a pas fonctionné. Réessayez.",
    seatsWarn: "Cela dépasse le nombre de places du véhicule. Je vous contacte.",
    nothing: "Rien d'indiqué", none: "Aucun devis dans ce lien",
    noneSub: "Demandez un nouveau lien à votre chauffeur.",
    thanksYes: "Merci — votre trajet est confirmé.",
    thanksNo: "Pas de souci — j'en suis informé.",
    sending: "Envoi…", stops: "Trajet",
    yourRide: "Votre trajet", totalDriven: "Distance totale parcourue",
    failed: "L'envoi n'a pas fonctionné. Réessayez.",
    lockedNote: "Vous avez déjà répondu à ce devis, les informations sont donc fermées.",
    callDriver: "Besoin d'un changement ? Écrivez-moi.",
    notReady: "Je prépare encore ce devis pour vous.",
  },
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

function phrase(store: Counts, items: string[], dict: Record<string, [string, string]>) {
  return items
    .filter((k) => (store?.[k] ?? 0) > 0)
    .map((k) => `${store[k]} ${store[k] === 1 ? dict[k][0] : dict[k][1]}`)
    .join(", ");
}

export default function CustomerQuote() {
  const [q, setQ] = useState<Payload | null>(null);
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, Counts>>({});
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const [saveFail, setSaveFail] = useState(false);

  useEffect(() => {
    (async () => {
      const t = window.location.hash.replace(/^#/, "").match(/(?:^|&)t=([^&]+)/)?.[1] ?? null;
      if (t) {
        try {
          setToken(t);
          const row = await fetchQuoteByToken(t);
          if (row) {
            setQ(row as Payload);
            setStatus((row as { status?: string }).status ?? null);
          }
        } catch { /* falls through to the empty state */ }
      }
      setReady(true);
    })();
  }, []);

  const L = T[q?.l ?? "pt"] ?? T.pt;
  const dict = ITEM[q?.l ?? "pt"] ?? ITEM.pt;
  const answered = status === "approved" || status === "declined";
  // Only a quote the driver has actually sent is open to an answer; the
  // database enforces this, so the page must not invite one it will refuse.
  const answerable = status === "sent";

  const counts: Record<string, Counts> = useMemo(() => ({
    pax: q?.xc?.pax ?? {}, gear: q?.xc?.gear ?? {}, bags: q?.xc?.bags ?? {},
  }), [q]);

  const seats = q?.seats ?? 7;
  const heads = (draft.pax?.adults ?? 0) + (draft.pax?.children ?? 0);
  const overSeats = editing && heads > seats;

  const answer = async (choice: "approved" | "declined") => {
    if (!token || busy) return;
    setBusy(true); setFailed(false);
    try {
      const r = await answerQuote(token, choice);
      setStatus(r.status);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  };

  const startEdit = () => {
    setDraft(JSON.parse(JSON.stringify(counts)));
    setSavedNote(false); setSaveFail(false);
    setEditing(true);
  };

  const bump = (grp: string, key: string, by: number) => {
    setDraft((d) => {
      const next = { ...d, [grp]: { ...(d[grp] ?? {}) } };
      next[grp][key] = Math.max(0, Math.min(20, (next[grp][key] ?? 0) + by));
      return next;
    });
  };

  const save = async () => {
    if (!token || saving) return;
    setSaving(true); setSaveFail(false);
    try {
      await updateQuoteCounts(token, draft);
      setQ((prev) => (prev ? { ...prev, xc: { ...prev.xc, ...draft } } : prev));
      setEditing(false); setSavedNote(true);
    } catch { setSaveFail(true); }
    finally { setSaving(false); }
  };

  if (!ready) return <div className="wrap" />;

  if (!q || !Array.isArray(q.t) || q.t.length === 0) {
    return (
      <div className="wrap cq">
        <div className="cq-empty">
          <h1>{L.none}</h1>
          <p>{L.noneSub}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap cq">
      <article className="cq-sheet">
        <header className="cq-head">
          <div className="cq-head-main">
            <p className="cq-biz">{q.b || L.title}</p>
            {q.p && <p className="cq-biz-sub">{q.p}</p>}
          </div>
          {q.n && (
            <div className="cq-no">
              <small>{L.quote}</small>
              <b>{q.n}</b>
            </div>
          )}
        </header>

        <div className="cq-hero">
          {q.c && <p className="cq-for">{L.forWhom} <b>{q.c}</b></p>}
          <div className="cq-price">
            <span className="cq-amt">{money(q.tot ?? 0)}</span>
            <span className="cq-cur">CAD</span>
          </div>
          {q.t.length > 1 && (
            <p className="cq-price-sub">
              {q.t.map((leg) => `${leg.k === "ret" ? L.ret : L.out} ${money(leg.pr)}`).join("   ·   ")}
            </p>
          )}
        </div>

        <section className="cq-section">
          <h2 className="cq-h">{L.stops}</h2>
          {q.t.map((leg, i) => (
            <div key={i} className="cq-leg">
              <div className="cq-leg-head">
                <span className="cq-tag">{leg.k === "ret" ? L.ret : L.out}</span>
                <span className="cq-when">
                  {(leg.d ? niceDate(leg.d, q.l ?? "pt") : "")
                    + (leg.h ? `  ·  ${L.at} ${leg.h}` : "")}
                </span>
                <span className="cq-fare">{money(leg.pr)}</span>
              </div>

              <ol className="cq-route">
                {(leg.s ?? []).map((name, n) => (
                  <li key={n} className={n === 0 || n === leg.s.length - 1 ? "end" : ""}>
                    <span className="cq-name">{name}</span>
                    {n < leg.s.length - 1 && Number.isFinite(leg.m?.[n]) && (
                      <span className="cq-gap">{km(leg.m[n])}</span>
                    )}
                  </li>
                ))}
              </ol>

              <div className="cq-leg-foot">
                {Number.isFinite(leg.pkm) && (leg.pkm ?? 0) > 0 ? (
                  <>
                    <span className="mine">
                      <b>{L.yourRide}</b>
                      {`${km(leg.pkm ?? 0)}  ·  ${dur(leg.pmn ?? 0)}`}
                    </span>
                    <span className="theirs">
                      <b>{L.totalDriven}</b>
                      {`${km(leg.km)}  ·  ${dur(leg.mn)}`}
                    </span>
                  </>
                ) : (
                  <span className="mine"><b>{L.yourRide}</b>{`${km(leg.km)}  ·  ${dur(leg.mn)}`}</span>
                )}
              </div>
            </div>
          ))}
        </section>

        <section className="cq-section">
          <div className="cq-h-row">
            <h2 className="cq-h">{L.review}</h2>
            {answerable && !editing && (
              <button type="button" className="cq-link" onClick={startEdit}>{L.edit}</button>
            )}
          </div>

          {!editing ? (
            <>
              <dl className="cq-details">
                {GROUPS.map(({ key, items }) => {
                  const text = phrase(counts[key] ?? {}, items, dict);
                  return (
                    <div key={key} className={"cq-detail" + (text ? "" : " empty")}>
                      <dt>{L[key]}</dt>
                      <dd>{text || L.nothing}</dd>
                    </div>
                  );
                })}
              </dl>
              {savedNote && <p className="cq-ok">{L.saved}</p>}
              <p className="cq-hint">
                {answered ? `${L.lockedNote} ${L.callDriver}` : L.editHint}
              </p>
            </>
          ) : (
            <div className="cq-edit">
              {GROUPS.map(({ key, items }) => (
                <div key={key} className="cq-group">
                  <h3>{L[key]}</h3>
                  {items.map((it) => (
                    <div key={it} className="cq-count">
                      <span className="cq-item">{dict[it][1]}</span>
                      <span className="cq-stepper">
                        <button type="button" aria-label={`Less ${dict[it][0]}`}
                                disabled={(draft[key]?.[it] ?? 0) <= 0}
                                onClick={() => bump(key, it, -1)}>−</button>
                        <output>{draft[key]?.[it] ?? 0}</output>
                        <button type="button" aria-label={`More ${dict[it][0]}`}
                                disabled={(draft[key]?.[it] ?? 0) >= 20}
                                onClick={() => bump(key, it, 1)}>+</button>
                      </span>
                    </div>
                  ))}
                </div>
              ))}

              {overSeats && <p className="cq-warn">{L.seatsWarn}</p>}
              {saveFail && <p className="cq-warn">{L.saveFail}</p>}

              <div className="cq-edit-acts">
                <button type="button" className="cq-btn ghost" disabled={saving}
                        onClick={() => setEditing(false)}>{L.cancel}</button>
                <button type="button" className="cq-btn solid" disabled={saving} onClick={save}>
                  {saving ? L.sending : L.done}
                </button>
              </div>
            </div>
          )}
        </section>

        <div className="cq-total">
          <span>{L.total}</span>
          <b>{money(q.tot ?? 0)} <small>CAD</small></b>
        </div>
      </article>

      <div className="cq-ask">
        {answered ? (
          <div className={"cq-verdict " + status}>
            <span className="cq-mark">{status === "approved" ? "✓" : "×"}</span>
            <p>{status === "approved" ? L.thanksYes : L.thanksNo}</p>
          </div>
        ) : !answerable ? (
          <p className="cq-q">{L.notReady}</p>
        ) : (
          <>
            <p className="cq-q">{L.ask}</p>
            <div className="cq-choice">
              <button className="cq-yes" type="button" disabled={busy || editing}
                      onClick={() => answer("approved")}>
                {busy ? L.sending : L.yes}
              </button>
              <button className="cq-decline" type="button" disabled={busy || editing}
                      onClick={() => answer("declined")}>
                {L.no}
              </button>
            </div>
            {failed && <p className="cq-warn">{L.failed}</p>}
          </>
        )}
      </div>
    </div>
  );
}
