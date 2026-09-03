"use client";

import { NumberField } from "./NumberField";
import { fmt, money, dur, grandTotals, orderedBands, tripTotals } from "@/lib/quote";
import type { Settings, Trip } from "@/lib/types";

/** The fare readout, styled as an instrument: dark in both themes, amber digits. */
export function Meter({
  trips, active, settings, learned, onPrice,
}: {
  trips: Trip[]; active: number; settings: Settings; learned: Record<string, number>;
  onPrice: (v: number | null) => void;
}) {
  const trip = trips[active] ?? trips[0];
  const t = tripTotals(trip, settings, learned);
  const hasRoute = t.total > 0 && t.missing === 0;
  const g = trips.length > 1 ? grandTotals(trips, settings, learned) : null;
  const bands = orderedBands(settings).map((b) => b.price);
  const override = trip.priceOverride;
  const isCustom = override != null && !bands.includes(override);

  return (
    <div className="meter">
      <div className="meter-strip">
        <div><div className="label">Distance</div>
          <div className="v">{t.total > 0 ? <>{fmt(t.total, 1)} <small>km</small></> : "—"}</div></div>
        <div><div className="label">Fuel{t.real ? " · real" : ""}</div>
          <div className="v">{t.total > 0 ? <>{fmt(t.fuelL, 1)} <small>L</small></> : "—"}</div></div>
        <div><div className="label">Time</div>
          <div className="v">{t.total > 0 ? dur(t.mins) : "—"}</div></div>
      </div>

      <div className="fare">
        <div className="label">{trips.length > 1 ? `Charge · ${trip.label}` : "Charge"}</div>
        <div className="fare-amount num">{t.total > 0 ? `$${fmt(t.price, 0)}` : "—"}</div>
        <div className="fare-note">
          {t.missing > 0
            ? `${t.missing} leg${t.missing > 1 ? "s" : ""} still need a distance`
            : t.total > 0
              ? (override != null ? `your price · band suggests $${fmt(t.band.price, 0)}` : `band ${t.band.note}`)
              : "Add a customer stop to start"}
        </div>
      </div>

      <div className="tiers">
        {bands.map((p, i) => {
          const on = override == null ? p === t.band.price : p === override;
          return (
            <button key={`${i}:${p}`} type="button" className="tier" aria-pressed={on}
                    onClick={() => onPrice(override === p ? null : p)}>
              ${fmt(p, 0)}
            </button>
          );
        })}
      </div>

      <div className="ownprice">
        <span className="label">Your own price</span>
        <span className={"tier custom" + (isCustom ? " on" : "")}>
          {/* Emptying it means "use the band again", which is why the empty
              case is decided on leaving rather than on each keystroke. */}
          <NumberField
            placeholder="other"
            ariaLabel="Your own price"
            value={isCustom ? override : null}
            onChange={(v) => onPrice(v)}
            onCommit={(v) => { if (v == null) onPrice(null); }} />
        </span>
        {isCustom && (
          <button type="button" className="ownprice-clear"
                  onClick={() => onPrice(null)}>
            use the band
          </button>
        )}
      </div>

      <div className="breakdown">
        <div className="brow"><span className="k">With passenger</span>
          <span className="n">{t.total > 0 ? `${fmt(t.loaded, 1)} km` : "—"}</span></div>
        <div className="brow"><span className="k">Empty legs</span>
          <span className="n">{t.total > 0 ? `${fmt(t.empty, 1)} km` : "—"}</span></div>
        <div className="brow"><span className="k">{t.real ? "Fuel cost · measured" : "Fuel cost"}</span>
          <span className="n">{t.total > 0 ? `−${money(t.cost)}` : "—"}</span></div>
        {t.real && Math.abs(t.cost - t.estCost) >= 0.005 && (
          <div className="brow sub"><span className="k">estimated</span>
            <span className="n">−{money(t.estCost)}</span></div>
        )}
        <div className={"brow keep" + (hasRoute && t.keep < t.cost ? " thin" : "")}>
          <span className="k">You keep</span>
          <span className="n">{hasRoute ? money(t.keep) : "—"}</span></div>
        <div className="brow"><span className="k">Per hour</span>
          <span className="n">{hasRoute && t.mins > 0 ? `${money(t.keep / (t.mins / 60))} /h` : "—"}</span></div>
      </div>

      <div className="combined" hidden={!g}>
        {g && (<>
          <div className="label">Both legs together</div>
          <div className="brow"><span className="k">Distance</span><span className="n">{fmt(g.total, 1)} km</span></div>
          <div className="brow"><span className="k">{g.measured > 0 ? `Fuel cost · ${g.measured === trips.length ? "measured" : `${g.measured} of ${trips.length} measured`}` : "Fuel cost"}</span><span className="n">−{money(g.cost)}</span></div>
          <div className="brow"><span className="k">You keep</span><span className="n">{money(g.price - g.cost)}</span></div>
          <div className="brow grand"><span className="k">Total charge</span><span className="n">${fmt(g.price, 0)}</span></div>
        </>)}
      </div>
    </div>
  );
}
