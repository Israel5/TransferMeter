"use client";

import { useState } from "react";
import { fmt } from "@/lib/quote";
import { DEFAULTS } from "@/lib/types";
import type { Band } from "@/lib/types";

/* What you charge, by how far.
 *
 * Read top to bottom: each row is everything up to that distance, and the last
 * row is everything beyond. The last row is the open one by position, not
 * because its distance happens to be blank -- otherwise clearing a box to
 * retype it would turn an ordinary band into a second open-ended one.
 *
 * Nothing reorders while you are typing. Sorting on each keystroke moves the
 * row out from under the cursor: type the 3 of 30 and the row jumps to the
 * top, taking the box you were typing in with it. They settle into order when
 * you leave the box.
 */

const tidy = (bands: Band[]): Band[] => {
  const usable = (bands ?? []).filter((b) => b && Number(b.price) >= 0);
  if (!usable.length) return DEFAULTS.bands;
  const capped = usable.filter((b) => Number(b.upTo) > 0);
  const open = usable.find((b) => !(Number(b.upTo) > 0)) ?? { upTo: null, price: 0 };
  return [...capped, { ...open, upTo: null }];
};

/** Shortest first, the open one last. Only ever on the way out of a box. */
const sorted = (bands: Band[]): Band[] => {
  const capped = bands.filter((b) => Number(b.upTo) > 0)
    .sort((a, b) => Number(a.upTo) - Number(b.upTo));
  const open = bands.find((b) => !(Number(b.upTo) > 0)) ?? { upTo: null, price: 0 };
  return [...capped, open];
};

export function BandEditor({
  bands, onChange,
}: {
  bands: Band[];
  onChange: (bands: Band[]) => void;
}) {
  const rows = tidy(bands);
  const lastIndex = rows.length - 1;

  // What is in a box while it is being typed in, which is not always a number:
  // "" and "3" are both things on the way to 30.
  const [typing, setTyping] = useState<Record<string, string>>({});
  const shownValue = (key: string, actual: number | null) =>
    typing[key] ?? (actual == null ? "" : String(actual));

  const set = (i: number, patch: Partial<Band>) =>
    onChange(rows.map((b, n) => (n === i ? { ...b, ...patch } : b)));

  const settle = () => { setTyping({}); onChange(sorted(rows)); };

  const add = () => {
    const capped = rows.filter((b) => Number(b.upTo) > 0);
    const furthest = capped.length ? Number(capped[capped.length - 1].upTo) : 0;
    const dearest = capped.length
      ? Number(capped[capped.length - 1].price)
      : Number(rows[lastIndex]?.price) || 0;
    // Above the furthest band that has a limit, which is usually where a new
    // one belongs. Type a smaller number and it drops into place.
    setTyping({});
    onChange([...capped, { upTo: furthest + 30, price: dearest + 10 }, rows[lastIndex]]);
  };

  const remove = (i: number) => {
    setTyping({});
    onChange(sorted(rows.filter((_, n) => n !== i)));
  };

  let from = 0;
  return (
    <div className="bands">
      <ul className="band-list">
        {rows.map((b, i) => {
          const isOpen = i === lastIndex;
          const covers = isOpen
            ? (from > 0 ? `over ${fmt(from, 0)} km` : "any distance")
            : (from > 0 ? `${fmt(from, 0)} to ${fmt(Number(b.upTo), 0)} km`
                        : `up to ${fmt(Number(b.upTo), 0)} km`);
          if (!isOpen) from = Number(b.upTo);

          return (
            <li key={i} className={"band" + (isOpen ? " open" : "")}>
              <span className="band-covers">{covers}</span>

              <span className="band-upto">
                {isOpen ? (
                  <span className="band-anything">and beyond</span>
                ) : (
                  <>
                    <input type="number" min="1" step="1" inputMode="decimal"
                           aria-label="Up to how many kilometres"
                           value={shownValue(`km${i}`, b.upTo)}
                           onChange={(e) => {
                             const raw = e.target.value;
                             setTyping((t) => ({ ...t, [`km${i}`]: raw }));
                             const v = parseFloat(raw);
                             // An empty box is mid-edit, not "no limit": the row
                             // keeps both its limit and its place until you leave.
                             if (Number.isFinite(v) && v > 0) set(i, { upTo: v });
                           }}
                           onBlur={settle} />
                    <span className="u">km</span>
                  </>
                )}
              </span>

              <span className="band-price">
                <span className="cur">$</span>
                <input type="number" min="0" step="1" inputMode="decimal"
                       aria-label="Price for this band"
                       value={shownValue(`p${i}`, b.price)}
                       onChange={(e) => {
                         const raw = e.target.value;
                         setTyping((t) => ({ ...t, [`p${i}`]: raw }));
                         const v = parseFloat(raw);
                         if (Number.isFinite(v) && v >= 0) set(i, { price: v });
                       }}
                       onBlur={() => setTyping({})} />
              </span>

              {/* The open band cannot go: without it a long trip has no price. */}
              <button type="button" className="band-drop" aria-label="Remove this band"
                      disabled={isOpen} title={isOpen ? "The last band has to stay" : "Remove"}
                      onClick={() => remove(i)}>×</button>
            </li>
          );
        })}
      </ul>

      <div className="route-actions" style={{ borderTop: 0, paddingTop: 4 }}>
        <button className="btn" type="button" onClick={add}>Add a band</button>
      </div>

      <p className="note">
        Each row is everything up to that distance; the last is everything beyond it.
        Type any distance you like — they sort themselves once you leave the box. A trip
        takes the band its whole distance falls in, your own runs to and from included,
        since you drive those too. You can still set a different price on any quote.
      </p>
    </div>
  );
}
