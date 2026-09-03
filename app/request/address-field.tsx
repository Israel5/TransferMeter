"use client";

import { useEffect, useRef, useState } from "react";

/* Somewhere to type an address, with Google's suggestions underneath.
 *
 * It stays useful when there are none: before the challenge is answered, or if
 * the lookup fails, it is still an ordinary box you can type an address into.
 * A customer must never be unable to say where they are going because a
 * suggestion service is having a bad morning.
 */

type Suggestion = { text: string; placeId?: string };

export function AddressField({
  label, value, onChange, enabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  enabled: boolean;
}) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const box = useRef<HTMLInputElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const look = (q: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (!enabled || q.trim().length < 3) { setItems([]); setOpen(false); return; }
    // A third of a second of quiet before asking: every keystroke is a charge,
    // and nobody has finished typing an address in less.
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/autocomplete?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        if (document.activeElement !== box.current) return;
        const found = (d.results ?? []).slice(0, 6) as Suggestion[];
        setItems(found);
        setOpen(found.length > 0);
        setCursor(-1);
      } catch { /* the box still works; it just has nothing to offer */ }
    }, 320);
  };

  const take = (s: Suggestion) => { onChange(s.text); setOpen(false); setItems([]); };

  return (
    <div className="rq-field wide">
      <span>{label}</span>
      <span className="rq-combo">
        <input
          ref={box}
          value={value}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => { onChange(e.target.value); look(e.target.value); }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (!open) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, items.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
            else if (e.key === "Enter" && cursor >= 0) { e.preventDefault(); take(items[cursor]); }
            else if (e.key === "Escape") setOpen(false);
          }} />
        <div className="rq-sugg" hidden={!open}>
          {items.map((it, n) => (
            <button
              key={it.placeId ?? it.text}
              type="button"
              aria-selected={n === cursor}
              onMouseDown={(e) => { e.preventDefault(); take(it); }}>
              {it.text}
            </button>
          ))}
        </div>
      </span>
    </div>
  );
}
