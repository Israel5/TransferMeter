"use client";

import { StopRow, type Suggestion } from "./StopRow";
import { CounterGroup } from "./Counters";
import { Meter } from "./Meter";
import { fmt, dur, niceDate, legInfo, scheduleFor, tripTotals, shortName } from "@/lib/quote";
import { PLACE_BY_NAME } from "@/lib/places";
import { parseCoords } from "@/lib/quote";
import { PAX_KEYS, GEAR_KEYS, BAG_KEYS } from "@/lib/types";
import type { AppState } from "@/lib/state";
import type { Lang, Stop, Trip } from "@/lib/types";

const clock = (d: Date) =>
  d.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false });

export function Editor({
  st, live, set, setTrip, mapsLeg, mapsRoute, quoteText, onSave, onSend, onPdf, onNewQuote, onBack, flash,
}: {
  st: AppState; live: boolean;
  set: (patch: Partial<AppState>) => void;
  setTrip: (i: number, patch: Partial<Trip>) => void;
  mapsLeg: (i: number) => string | null;
  mapsRoute: () => string | null;
  quoteText: string;
  onSave: () => void; onSend: () => void; onPdf: () => void;
  onNewQuote: () => void; onBack: () => void;
  flash: string;
}) {
  const trip = st.trips[st.active] ?? st.trips[0];
  const totals = tripTotals(trip, st.settings, st.learned);
  const sched = scheduleFor(trip, st.settings, st.learned);
  const gaps = st.trips.filter((t) => tripTotals(t, st.settings, st.learned).missing > 0);

  const people = (st.pax.adults ?? 0) + (st.pax.children ?? 0) + (st.pax.infants ?? 0);
  const seats = (st.gear.infantSeat ?? 0) + (st.gear.carSeat ?? 0) + (st.gear.booster ?? 0);
  const bagCount = BAG_KEYS.reduce((n, [k]) => n + (st.bags[k] ?? 0), 0);
  const summary = [people && `${people} pax`, seats && `${seats} seat${seats > 1 ? "s" : ""}`,
                   bagCount && `${bagCount} bag${bagCount > 1 ? "s" : ""}`].filter(Boolean).join(" · ");
  const warn = people > st.settings.seats
    ? `${people} passengers but only ${st.settings.seats} seats in the car.`
    : seats > (st.pax.children ?? 0) + (st.pax.infants ?? 0)
      ? `More child seats (${seats}) than children and babies. Worth double-checking.`
      : "";

  const stops = trip.stops;
  const patchStops = (next: Stop[]) => setTrip(st.active, { stops: next, liveLegs: null });

  function pick(i: number, s: Suggestion) {
    const next = stops.slice();
    const hit = PLACE_BY_NAME.get(s.text.toLowerCase());
    const coords = parseCoords(s.text);
    next[i] = { name: s.text, base: false, placeId: s.placeId,
                lat: hit?.lat ?? coords?.lat, lng: hit?.lng ?? coords?.lng };
    patchStops(next);
  }

  return (
    <div id="view-quote">
      <div className="backbar">
        <button className="btn" type="button" onClick={onBack}>← All trips</button>
        <span className="backbar-who">
          {(st.quoteNo.trim() ? `#${st.quoteNo.trim()}` : "Unsaved trip")
            + (st.customer.trim() ? `  ·  ${st.customer.trim()}` : "")}
        </span>
      </div>

      <div className="grid">
        <div>
          <section className="card">
            <div className="card-head">
              <span className="label">Trip</span>
              <button className="link" type="button"
                      onClick={() => setTrip(st.active, { stops: defaultFor(st, "to"), liveLegs: null, priceOverride: null })}>To airport</button>
              <button className="link" type="button"
                      onClick={() => setTrip(st.active, { stops: defaultFor(st, "from"), liveLegs: null, priceOverride: null })}>From airport</button>
              {mapsRoute() && <a className="maps head" href={mapsRoute()!} target="_blank" rel="noopener">Maps ↗</a>}
            </div>

            <div className="card-body">
              <div className="trips">
                {st.trips.map((t, i) => (
                  <button key={i} type="button" className="trip-tab" aria-selected={i === st.active}
                          onClick={() => set({ active: i })}>
                    <span className="t">{t.label}</span>
                    <span className="d">{(t.date ? niceDate(t.date, st.lang) : "no date") + (t.time ? `  ${t.time}` : "")}</span>
                  </button>
                ))}
                {st.trips.length < 2 && (
                  <button type="button" className="trip-add"
                          onClick={() => set({ trips: [...st.trips, mirror(st)], active: st.trips.length })}>
                    + Add return leg
                  </button>
                )}
              </div>

              <div className="trip-bar" style={{ marginTop: 12 }}>
                <span className="date-field">
                  <label className="label" htmlFor="trip-date">Date</label>
                  <input id="trip-date" type="date" value={trip.date}
                         onChange={(e) => setTrip(st.active, { date: e.target.value })} />
                </span>
                <span className="date-field">
                  <label className="label" htmlFor="trip-time">Pick-up</label>
                  <input id="trip-time" type="time" value={trip.time}
                         onChange={(e) => setTrip(st.active, { time: e.target.value })} />
                </span>
                <span className="top-spacer" />
                <button className="icon" type="button" title="Reverse this route" aria-label="Reverse this route"
                        onClick={() => patchStops(stops.slice().reverse())}>⇅</button>
                {st.trips.length > 1 && (
                  <button className="link" type="button"
                          onClick={() => set({ trips: st.trips.filter((_, i) => i !== st.active), active: 0 })}>
                    Remove this leg
                  </button>
                )}
              </div>

              {sched && (
                <div className="schedule">
                  <div className="sched-cell lead">
                    <span className="k">Leave home</span>
                    <div className="v">{clock(sched.leave)}</div>
                    <div className="d">{`${Math.round(sched.driveToPickup)} min drive + ${st.settings.leaveBuffer} min slack`}</div>
                  </div>
                  <div className="sched-cell">
                    <span className="k">Pick up</span>
                    <div className="v">{clock(sched.pickup)}</div>
                    <div className="d">{niceDate(trip.date, st.lang)}</div>
                  </div>
                  {sched.arrive && (
                    <div className="sched-cell">
                      <span className="k">Arrive</span>
                      <div className="v">{clock(sched.arrive)}</div>
                      <div className="d">{sched.dest ?? ""}</div>
                    </div>
                  )}
                </div>
              )}

              <ul className="route">
                {stops.map((stop, i) => (
                  <StopRowWithLeg
                    key={i} stop={stop} i={i} stops={stops} st={st} live={live}
                    totals={totals} mapsLeg={mapsLeg}
                    onChange={(name: string) => {
                      const next = stops.slice();
                      const known = PLACE_BY_NAME.has(name.trim().toLowerCase());
                      next[i] = { ...next[i], name, base: known || parseCoords(name) ? false : next[i].base,
                                  placeId: undefined };
                      patchStops(next);
                    }}
                    onPick={(s: Suggestion) => pick(i, s)}
                    onMove={(d: number) => {
                      const j = i + d; if (j < 0 || j >= stops.length) return;
                      const next = stops.slice(); [next[i], next[j]] = [next[j], next[i]];
                      patchStops(next);
                    }}
                    onRemove={() => patchStops(stops.filter((_, n) => n !== i))}
                    onToggleBase={() => {
                      const next = stops.slice();
                      next[i] = stop.base
                        ? { name: "" }
                        : { name: st.settings.homeName, base: true };
                      patchStops(next);
                    }}
                    onKm={(v: number) => {
                      const info = legInfo(trip, i, st.settings, st.learned);
                      const learned = { ...st.learned };
                      if (Number.isFinite(v) && v >= 0) learned[info.key] = v; else delete learned[info.key];
                      set({ learned });
                    }}
                    onReestimate={() => {
                      const info = legInfo(trip, i, st.settings, st.learned);
                      const learned = { ...st.learned }; delete learned[info.key];
                      set({ learned });
                    }}
                  />
                ))}
              </ul>

              <div className="route-actions">
                <button className="btn" type="button" onClick={() => {
                  const next = stops.slice();
                  next.splice(Math.max(1, next.length - 1), 0, { name: "" });
                  patchStops(next);
                }}>+ Add stop</button>
              </div>
            </div>
          </section>

          <section className="card" style={{ marginTop: 18 }}>
            <div className="card-head">
              <span className="label">Passengers &amp; luggage</span>
              <span className="unit">{summary}</span>
            </div>
            <div className="card-body">
              <CounterGroup title="Who is travelling" keys={PAX_KEYS} store={st.pax}
                            onChange={(k, d) => set({ pax: bump(st.pax, k, d) })} />
              <CounterGroup title="Child seats I need to bring" keys={GEAR_KEYS} store={st.gear}
                            onChange={(k, d) => set({ gear: bump(st.gear, k, d) })} />
              <CounterGroup title="Luggage" keys={BAG_KEYS} store={st.bags}
                            onChange={(k, d) => set({ bags: bump(st.bags, k, d) })} />
              <p className="warn-line" hidden={!warn}>{warn}</p>
            </div>
          </section>

          <section className="card" style={{ marginTop: 18 }}>
            <div className="card-head">
              <span className="label" style={{ flex: "none" }}>Quote</span>
              <span className="qno">{st.quoteNo}</span>
              <span className="top-spacer" />
              <div className="langs">
                {(["pt", "en", "fr"] as Lang[]).map((l) => (
                  <button key={l} type="button" className="lang" aria-pressed={st.lang === l}
                          onClick={() => set({ lang: l })}>{l.toUpperCase()}</button>
                ))}
              </div>
            </div>
            <div className="card-body">
              <div className="fields" style={{ marginBottom: 12 }}>
                <div className="field">
                  <label className="label" htmlFor="customer">Customer name</label>
                  <input id="customer" type="text" className="loc" placeholder="Who is this quote for?"
                         value={st.customer} onChange={(e) => set({ customer: e.target.value })} />
                </div>
                <div className="field">
                  <label className="label" htmlFor="contact">WhatsApp</label>
                  <input id="contact" type="text" className="loc" inputMode="tel"
                         placeholder="514 555 0123, +55 11 …, or @handle"
                         value={st.contact} onChange={(e) => set({ contact: e.target.value })} />
                </div>
              </div>

              <div className="field" style={{ marginBottom: 12 }}>
                <label className="label" htmlFor="notes">
                  Private notes <span style={{ textTransform: "none", letterSpacing: 0 }}>— never shown to the customer</span>
                </label>
                <textarea id="notes" className="notes" value={st.notes}
                          placeholder="Gate code, flight number, prefers the front seat…"
                          onChange={(e) => set({ notes: e.target.value })} />
              </div>

              <p className="warn-line" hidden={gaps.length === 0}>
                {gaps.map((g) => g.label).join(" and ")}
                {gaps.length > 1 ? " legs have" : " leg has"} a stop with no distance yet, so
                {gaps.length > 1 ? " their fares aren't" : " its fare isn't"} counted in the total.
                Saving still keeps everything you've typed.
              </p>

              <textarea className="quote" readOnly aria-label="Quote message" value={quoteText} />

              <div className="route-actions" style={{ borderTop: 0, paddingTop: 10, marginTop: 0 }}>
                <button className="btn primary" type="button" onClick={onSend}>Send</button>
                <button className="btn" type="button" onClick={onSave}>Save quote</button>
                <button className="btn" type="button" onClick={onPdf}>PDF</button>
                <button className="btn" type="button" onClick={onNewQuote}>New quote</button>
                <span className="unit" role="status" aria-live="polite">{flash}</span>
              </div>
            </div>
          </section>
        </div>

        <div className="meter-col">
          <Meter trips={st.trips} active={st.active} settings={st.settings} learned={st.learned}
                 onPrice={(v) => setTrip(st.active, { priceOverride: v })} />
        </div>
      </div>
    </div>
  );
}

function StopRowWithLeg({
  stop, i, stops, st, live, totals, mapsLeg, onChange, onPick, onMove, onRemove, onToggleBase, onKm, onReestimate,
}: any) {
  const info = totals.legs[i];
  return (
    <>
      <StopRow stop={stop} index={i} total={stops.length} live={live}
               onChange={onChange} onPick={onPick} onMove={onMove}
               onRemove={onRemove} onToggleBase={onToggleBase} />
      {i < stops.length - 1 && info && (
        <li className="leg">
          <span className="leg-rail" />
          <span className="leg-body">
            <input className={"km" + (info.known ? "" : " unknown")} type="number" step="0.1" min="0"
                   inputMode="decimal" aria-label={`Distance for leg ${i + 1}`} placeholder="set km"
                   defaultValue={info.km != null ? info.km.toFixed(1) : ""}
                   key={`${info.key}-${info.source}-${info.km ?? "x"}`}
                   onBlur={(e) => onKm(parseFloat(e.target.value))} />
            <span className="unit">km</span>
            <span className={"chip" + (info.source === "saved" || info.source === "google" ? " saved"
                                     : info.source === "none" ? " warn" : "")}>
              {info.source === "saved" ? "saved" : info.source === "google" ? "google"
                : info.source === "est" ? "est." : "needs a distance"}
            </span>
            {info.source === "saved" && (
              <button className="link" type="button" onClick={onReestimate}>re-estimate</button>
            )}
            {mapsLeg(i) && (
              <a className="maps" href={mapsLeg(i)!} target="_blank" rel="noopener"
                 title="Open this leg in Google Maps, then type the real distance here">
                {info.source === "saved" ? "Maps ↗" : "Check in Maps ↗"}
              </a>
            )}
          </span>
        </li>
      )}
    </>
  );
}

const bump = (c: Record<string, number>, k: string, d: number) =>
  ({ ...c, [k]: Math.max(0, Math.min(9, (c[k] ?? 0) + d)) });

function defaultFor(st: AppState, dir: "to" | "from") {
  const yul = { name: "YUL — Montréal-Trudeau Airport" };
  const home = { name: st.settings.homeName, base: true };
  return dir === "from" ? [home, yul, { name: "" }, home] : [home, { name: "" }, yul, home];
}
function mirror(st: AppState): Trip {
  const t = st.trips[0];
  const mid = t.stops.slice(1, -1).reverse().map((s) => ({ ...s }));
  const home = { name: st.settings.homeName, base: true };
  return { label: "Return", date: "", time: "", stops: [home, ...mid, home], liveLegs: null, priceOverride: null };
}
