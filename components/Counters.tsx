"use client";

import type { Counts } from "@/lib/types";

/** Tap targets rather than typed numbers — this is used one-handed in a car. */
export function CounterGroup({
  title, keys, store, onChange,
}: {
  title: string;
  keys: [string, string][];
  store: Counts;
  onChange: (key: string, delta: number) => void;
}) {
  return (
    <div className="count-group">
      <span className="label">{title}</span>
      <div className="counts">
        {keys.map(([k, label]) => {
          const v = store[k] ?? 0;
          return (
            <div key={k} className={"count" + (v > 0 ? " on" : "")}>
              <span className="count-name">{label}</span>
              <button className="count-btn" type="button" aria-label={`One fewer ${label}`}
                      disabled={v <= 0} onClick={() => onChange(k, -1)}>−</button>
              <span className="count-n" aria-live="polite">{v}</span>
              <button className="count-btn" type="button" aria-label={`One more ${label}`}
                      disabled={v >= 9} onClick={() => onChange(k, 1)}>+</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
