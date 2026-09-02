"use client";

import { useState } from "react";
import { fmt, money, niceDate, shortName } from "@/lib/quote";
import { waLink } from "@/lib/whatsapp";
import type { Quote, Settings } from "@/lib/types";

type Leg = {
  date: string; time: string; status: string; contact: string;
  customer: string; quoteNo: string; label: string;
  km: number; price: number; cost: number; tip: number; paid: boolean;
  from: string; to: string; quoteId: string; legIndex: number;
};

/** Works in legs, not quotes: a round trip appears on both of its days. */
function bookedLegs(quotes: Quote[], includePending: boolean): Leg[] {
  const out: Leg[] = [];
  quotes.forEach((q) => {
    const st = q.status ?? "draft";
    if (st === "declined") return;
    if (st !== "approved" && !includePending) return;
    (q.trips ?? []).forEach((t, i) => {
      if (!t.date) return;
      const named = (t.stops ?? [])
        .filter((s) => !s.base && String(s.name || "").trim()).map((s) => shortName(s.name));
      out.push({
        date: t.date, time: t.time || "", status: st, contact: q.contact ?? "",
        customer: q.customer || "(no name)", quoteNo: q.quoteNo ?? "", label: t.label,
        km: t.totalKm ?? 0, price: t.price ?? 0, cost: t.cost ?? 0,
        tip: t.tip ?? 0, paid: !!t.paid,
        from: named[0] ?? "—", to: named[named.length - 1] ?? "—",
        quoteId: q.id, legIndex: i,
      });
    });
  });
  return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

export function Calendar({
  quotes, settings, onPatch,
}: {
  quotes: Quote[]; settings: Settings;
  onPatch: (id: string, patch: Partial<Quote>) => void;
}) {
  const now = new Date();
  const [month, setMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [pick, setPick] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const legs = bookedLegs(quotes, pending);
  const mk = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  const inMonth = legs.filter((l) => l.date.slice(0, 7) === mk);
  const shown = pick ? inMonth.filter((l) => l.date === pick) : inMonth;

  const sum = shown.reduce((a, l) => ({
    n: a.n + 1, km: a.km + l.km, price: a.price + l.price,
    cost: a.cost + l.cost, tip: a.tip + l.tip, owed: a.owed + (l.paid ? 0 : l.price),
  }), { n: 0, km: 0, price: 0, cost: 0, tip: 0, owed: 0 });
  const all = legs.reduce((a, l) => ({
    n: a.n + 1, price: a.price + l.price, cost: a.cost + l.cost, tip: a.tip + l.tip,
  }), { n: 0, price: 0, cost: 0, tip: 0 });
  const took = sum.price + sum.tip;

  // Local date, never UTC: otherwise the wrong day lights up every evening.
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

  const setLeg = (l: Leg, patch: { paid?: boolean; tip?: number }) => {
    const q = quotes.find((x) => x.id === l.quoteId);
    if (!q) return;
    onPatch(q.id, { trips: (q.trips ?? []).map((t, i) => i === l.legIndex ? { ...t, ...patch } : t) });
  };

  return (
    <div id="view-calendar">
      <section className="card">
        <div className="card-head">
          <button className="icon" type="button" aria-label="Previous month"
                  onClick={() => { setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1)); setPick(null); }}>‹</button>
          <span className="label" style={{ flex: 1, textAlign: "center", fontSize: ".95rem" }}>
            {month.toLocaleDateString("en-CA", { month: "long", year: "numeric" })}
          </span>
          <button className="icon" type="button" aria-label="Next month"
                  onClick={() => { setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)); setPick(null); }}>›</button>
        </div>
        <div className="card-body">
          <label className="inline-check">
            <input type="checkbox" checked={pending} onChange={(e) => setPending(e.target.checked)} />
            {" "}Show quotes that aren&apos;t approved yet
          </label>

          <div className="cal-grid">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="cal-dow">{d}</div>
            ))}
            {Array.from({ length: first.getDay() }).map((_, i) => (
              <div key={`b${i}`} className="cal-day blank" />
            ))}
            {Array.from({ length: days }).map((_, n) => {
              const d = n + 1;
              const iso = `${mk}-${String(d).padStart(2, "0")}`;
              const mine = inMonth.filter((l) => l.date === iso);
              return (
                <button key={iso} type="button"
                        className={"cal-day" + (mine.length ? " has" : "") + (iso === todayISO ? " today" : "")}
                        aria-pressed={pick === iso}
                        aria-label={`${d}, ${mine.length} transfer${mine.length === 1 ? "" : "s"}`}
                        onClick={() => setPick(pick === iso ? null : iso)}>
                  <span className="n">{d}</span>
                  {mine.slice(0, 2).map((l, i) => (
                    <span key={i} className={"cal-pill" + (l.status === "approved" ? "" : " pending")}>
                      {(l.time ? `${l.time} ` : "") + l.customer.split(" ")[0]}
                    </span>
                  ))}
                  {mine.length > 2 && <span className="cal-pill pending">+{mine.length - 2} more</span>}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <div className="card-head">
          <span className="label">Money</span>
          <span className="unit">
            {pick ? niceDate(pick, "en") : month.toLocaleDateString("en-CA", { month: "long", year: "numeric" })}
          </span>
        </div>
        <div className="card-body">
          <div className="tiles">
            <div className="tile rev"><span className="k">Charged</span>
              <div className="v">{money(sum.price)}</div>
              <div className="sub">{sum.n} transfer{sum.n === 1 ? "" : "s"}</div></div>
            {sum.tip > 0 && (
              <div className="tile tips"><span className="k">Tips</span>
                <div className="v">+{money(sum.tip)}</div>
                <div className="sub">on top of the fare</div></div>
            )}
            <div className="tile fuel"><span className="k">Fuel</span>
              <div className="v">−{money(sum.cost)}</div>
              <div className="sub">{fmt(sum.km, 0)} km driven</div></div>
            <div className="tile keep"><span className="k">Kept after fuel</span>
              <div className="v">{money(took - sum.cost)}</div>
              <div className="sub">{took > 0 ? `${Math.round(((took - sum.cost) / took) * 100)}% of ${money(took)} taken in` : ""}</div></div>
            {sum.owed > 0 && (
              <div className="tile owed"><span className="k">Still owed</span>
                <div className="v">{money(sum.owed)}</div>
                <div className="sub">{shown.filter((l) => !l.paid).length} not paid yet</div></div>
            )}
          </div>

          <p className="note">
            {`Fuel is the only cost counted here — ${fmt(settings.kmPerL, 1)} km/L at ${money(settings.fuelPrice)}/L. `}
            {"Insurance, maintenance, tyres and tax are not."}
            {all.n > 0 && `  All time: ${money(all.price)} charged${all.tip > 0 ? ` plus ${money(all.tip)} in tips` : ""}, ${money(all.price + all.tip - all.cost)} kept over ${all.n} transfers.`}
          </p>

          <ul className="daylist">
            {shown.map((l, i) => {
              const chat = waLink(l.contact, "", settings);
              return (
                <li key={i} className="day-row">
                  <span className="when">{niceDate(l.date, "en").slice(5) + (l.time ? ` ${l.time}` : "")}</span>
                  <span className="what">
                    <div className="who">{(l.quoteNo ? `#${l.quoteNo}  ` : "") + l.customer + (l.status === "approved" ? "" : ` (${l.status})`)}</div>
                    <div className="route">{`${l.from} → ${l.to} · ${fmt(l.km, 0)} km · fuel ${money(l.cost)}`}</div>
                  </span>
                  {chat && <a className="wa" href={chat} target="_blank" rel="noopener" title={`Message ${l.customer}`}>WhatsApp</a>}
                  <button type="button" className={"paidbtn" + (l.paid ? " yes" : "")}
                          onClick={() => setLeg(l, { paid: !l.paid })}>{l.paid ? "Paid" : "Unpaid"}</button>
                  <span className={"tip-field" + (l.tip > 0 ? " has" : "")}>
                    <span className="cur">tip +$</span>
                    <input type="number" min="0" step="1" inputMode="decimal" placeholder="0"
                           aria-label={`Tip for ${l.customer}`} value={l.tip ? String(l.tip) : ""}
                           onChange={(e) => {
                             const v = parseFloat(e.target.value);
                             setLeg(l, { tip: Number.isFinite(v) && v > 0 ? v : 0 });
                           }} />
                  </span>
                  <span className="amt" style={l.paid ? undefined : { color: "var(--bad)" }}>
                    {`$${fmt(l.price, 0)}${l.tip > 0 ? ` +${fmt(l.tip, 0)}` : ""}`}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="empty" hidden={shown.length > 0}>
            {pick ? "Nothing booked that day." : "No transfers booked this month."}
          </p>
        </div>
      </section>
    </div>
  );
}
