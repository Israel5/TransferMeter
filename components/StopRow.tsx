"use client";

import { useEffect, useRef, useState } from "react";
import { PLACES, PLACE_BY_NAME } from "@/lib/places";
import { parseCoords } from "@/lib/quote";
import type { Stop } from "@/lib/types";

type Suggestion = { text: string; placeId?: string };

/** Your base is shown by its role. The address stays in settings, never on screen. */
function baseLabel(i: number, total: number) {
  if (i === 0) return "Starting point";
  if (i === total - 1) return "End point";
  return "My base";
}

export function StopRow({
  stop, index, total, live, onChange, onPick, onMove, onRemove, onToggleBase,
}: {
  stop: Stop; index: number; total: number; live: boolean;
  onChange: (name: string) => void;
  onPick: (s: Suggestion) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
  onToggleBase: () => void;
}) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const letters = "ABCDEFGHIJKLMNOP";
  const label = baseLabel(index, total);

  function search(q: string) {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setItems([]); setOpen(false); return; }
    const local: Suggestion[] = PLACES
      .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 5).map((p) => ({ text: p.name }));
    setItems(local); setOpen(local.length > 0); setCursor(-1);
    if (!live) return;
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/autocomplete?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        if (document.activeElement !== box.current) return;
        const merged = local.slice(0, 3).concat((d.results ?? []).slice(0, 6));
        setItems(merged); setOpen(merged.length > 0);
      } catch { /* offline: local matches still stand */ }
    }, 280);
  }

  return (
    <>
      <li className="stop">
        <span className={"pin" + (stop.base ? " base" : "")}>
          {stop.base ? "⌂" : letters[index] ?? index + 1}
        </span>

        <span className="combo">
          <input
            ref={box}
            className={"loc" + (stop.base ? " base-field" : "")}
            autoComplete="off"
            readOnly={!!stop.base}
            title={stop.base ? "Your saved address — change it in settings" : undefined}
            aria-label={stop.base ? `${label} (your saved address)` : `Stop ${index + 1}`}
            placeholder={stop.base ? undefined : "Neighbourhood, full address, or 45.49, -73.65"}
            value={stop.base ? label : stop.name}
            onChange={(e) => { if (!stop.base) { onChange(e.target.value); search(e.target.value); } }}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={(e) => {
              if (!open) return;
              if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, items.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
              else if (e.key === "Enter" && cursor >= 0) { e.preventDefault(); onPick(items[cursor]); setOpen(false); }
              else if (e.key === "Escape") setOpen(false);
            }}
          />
          <div className="sugg" hidden={!open}>
            {items.map((it, n) => (
              <button
                key={it.placeId ?? it.text}
                type="button"
                aria-selected={n === cursor}
                onMouseDown={(e) => { e.preventDefault(); onPick(it); setOpen(false); }}
              >
                {it.text}
                <span className="kind">{it.placeId ? "address" : "area"}</span>
              </button>
            ))}
          </div>
        </span>

        <span className="stop-tools">
          <button className="icon" type="button" title={stop.base ? "Start somewhere else this time" : "Use my own address here"}
                  aria-label={stop.base ? "Start somewhere else" : "Use my own address"} onClick={onToggleBase}>
            {stop.base ? "✎" : "⌂"}
          </button>
          <button className="icon" type="button" title="Move up" aria-label="Move up"
                  disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
          <button className="icon" type="button" title="Move down" aria-label="Move down"
                  disabled={index === total - 1} onClick={() => onMove(1)}>↓</button>
          <button className="icon" type="button" title="Remove stop" aria-label="Remove stop"
                  disabled={total <= 2} onClick={onRemove}>×</button>
        </span>
      </li>
    </>
  );
}

export { baseLabel };
export type { Suggestion };
