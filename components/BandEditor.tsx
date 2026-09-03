"use client";

import { fmt } from "@/lib/quote";
import { DEFAULTS } from "@/lib/types";
import type { Band } from "@/lib/types";

/* What you charge, by how far.
 *
 * Read top to bottom: each row is everything up to that distance, and the last
 * row is everything beyond. There is exactly one row without a limit, because
 * a set of bands that stops somewhere leaves a trip with no price.
 */

export function BandEditor({
  bands, onChange,
}: {
  bands: Band[];
  onChange: (bands: Band[]) => void;
}) {
  // An empty list is a settings row that has not been repaired yet, not an
  // instruction to charge nothing.
  const usable = bands.filter((b) => b && Number(b.price) > 0);
  const shown = usable.length ? usable : DEFAULTS.bands;
  const capped = shown.filter((b) => Number(b.upTo) > 0)
    .sort((a, b) => Number(a.upTo) - Number(b.upTo));
  const open = shown.find((b) => !(Number(b.upTo) > 0)) ?? { upTo: null, price: 0 };
  const rows = [...capped, open];

  const write = (next: Band[]) => onChange(next);

  const set = (i: number, patch: Partial<Band>) =>
    write(rows.map((b, n) => (n === i ? { ...b, ...patch } : b)));

  const add = () => {
    // A new band goes above the highest one that has a limit, which is where
    // you would put it: the open-ended row stays last.
    const highest = capped.length ? Number(capped[capped.length - 1].upTo) : 0;
    const dearest = capped.length ? Number(capped[capped.length - 1].price) : Number(open.price) || 0;
    write([...capped, { upTo: highest + 30, price: dearest + 10 }, open]);
  };

  const remove = (i: number) => write(rows.filter((_, n) => n !== i));

  let from = 0;
  return (
    <div className="bands">
      <ul className="band-list">
        {rows.map((b, i) => {
          const limited = Number(b.upTo) > 0;
          const covers = limited
            ? (from > 0 ? `${fmt(from, 0)} to ${fmt(Number(b.upTo), 0)} km` : `up to ${fmt(Number(b.upTo), 0)} km`)
            : (from > 0 ? `over ${fmt(from, 0)} km` : "any distance");
          if (limited) from = Number(b.upTo);

          return (
            <li key={i} className={"band" + (limited ? "" : " open")}>
              <span className="band-covers">{covers}</span>

              <span className="band-upto">
                {limited ? (
                  <>
                    <input type="number" min="1" step="1" inputMode="decimal"
                           aria-label="Up to how many kilometres"
                           value={String(b.upTo ?? "")}
                           onChange={(e) => {
                             const v = parseFloat(e.target.value);
                             set(i, { upTo: Number.isFinite(v) && v > 0 ? v : null });
                           }} />
                    <span className="u">km</span>
                  </>
                ) : (
                  <span className="band-anything">and beyond</span>
                )}
              </span>

              <span className="band-price">
                <span className="cur">$</span>
                <input type="number" min="0" step="1" inputMode="decimal"
                       aria-label="Price for this band"
                       value={String(b.price ?? "")}
                       onChange={(e) => {
                         const v = parseFloat(e.target.value);
                         set(i, { price: Number.isFinite(v) && v >= 0 ? v : 0 });
                       }} />
              </span>

              {/* The open-ended band cannot be removed: without it a long trip
                  has no price at all. */}
              <button type="button" className="band-drop" aria-label="Remove this band"
                      disabled={!limited} title={limited ? "Remove" : "The last band has to stay"}
                      onClick={() => remove(i)}>×</button>
            </li>
          );
        })}
      </ul>

      <div className="route-actions" style={{ borderTop: 0, paddingTop: 4 }}>
        <button className="btn" type="button" onClick={add}>Add a band</button>
      </div>

      <p className="note">
        Read down the list: each row is everything up to that distance, and the last
        is everything beyond it. A trip takes the band its whole distance falls in —
        your own runs to and from included, since you drive those too. You can still
        set a different price on any quote.
      </p>
    </div>
  );
}
