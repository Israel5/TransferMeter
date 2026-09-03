"use client";

import { useMemo, useRef, useState } from "react";
import {
  DEFAULTS, MESSAGE_KINDS, VARIABLES, isCustom, renderTemplate, templateFor, varsFor,
  type MessageKind,
} from "@/lib/templates";
import type { Lang, Quote, Settings } from "@/lib/types";

/* Rewriting what a customer receives.
 *
 * One message and one language at a time, with the preview underneath filled
 * from a real quote wherever there is one -- because a template reads fine and
 * a message built from it may not, and the difference only shows once the
 * values are in.
 */

const LANGS: { key: Lang; label: string }[] = [
  { key: "pt", label: "Português" },
  { key: "en", label: "English" },
  { key: "fr", label: "Français" },
];

/** Something to preview against. A real quote if one exists, since made-up
 *  names hide the problems real ones cause. */
function sampleQuote(quotes: Quote[]): Quote {
  const real = (quotes ?? []).find((q) => (q.trips ?? []).some((t) => t.date) && q.customer);
  if (real) return real;
  return {
    id: 1, savedAt: new Date().toISOString(), quoteNo: "2026-001", origin: "driver",
    customer: "Ana Souza", contact: "", notes: "", status: "sent", lang: "pt",
    trips: [{
      label: "Outbound", date: new Date().toISOString().slice(0, 10), time: "17:00",
      stops: [{ name: "Home", base: true }, { name: "1500 Rue Sherbrooke Ouest" },
              { name: "YUL — Montréal-Trudeau Airport" }, { name: "Home", base: true }],
      legKm: [12, 18, 14], totalKm: 44, mins: 95, cost: 17.6, price: 60,
      paxKm: 18, paxMins: 32, tip: 0, paid: false, override: null,
    }],
    pax: { adults: 2, children: 1, infants: 0 }, gear: {}, bags: { checked: 2, carry: 2 },
    totalKm: 44, cost: 17.6, price: 60, mins: 95, keep: 42.4,
  };
}

export function MessageEditor({
  settings, quotes, onChange,
}: {
  settings: Settings; quotes: Quote[];
  onChange: (templates: Settings["templates"]) => void;
}) {
  const [kind, setKind] = useState<MessageKind>("reminder");
  const [lang, setLang] = useState<Lang>("pt");
  const box = useRef<HTMLTextAreaElement | null>(null);

  const text = templateFor(kind, lang, settings);
  const custom = isCustom(kind, lang, settings);
  const sample = useMemo(() => sampleQuote(quotes), [quotes]);

  const preview = useMemo(() => renderTemplate(
    text,
    varsFor(sample, (sample.trips ?? [])[0], "https://…/quote/1541ac65c01040f98d0b27bd", settings, lang,
            { when: kind === "onway" ? "today" : "tomorrow" }),
  ), [text, sample, settings, lang, kind]);

  const write = (value: string) => {
    const next = { ...(settings.templates ?? {}) };
    const forKind = { ...(next[kind] ?? {}) };
    // An empty box is not an empty message: it means "use the default again".
    if (value.trim()) forKind[lang] = value; else delete forKind[lang];
    if (Object.keys(forKind).length) next[kind] = forKind; else delete next[kind];
    onChange(next);
  };

  /** Drop a variable where the cursor is, rather than making them type it. */
  const insert = (name: string) => {
    const el = box.current;
    const token = `{{${name}}}`;
    if (!el) { write(text + token); return; }
    const at = el.selectionStart ?? text.length;
    const to = el.selectionEnd ?? at;
    write(text.slice(0, at) + token + text.slice(to));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = at + token.length;
    });
  };

  return (
    <div className="msgs">
      <div className="msg-pick">
        <div className="msg-kinds">
          {MESSAGE_KINDS.map((m) => (
            <button key={m.key} type="button" aria-pressed={kind === m.key}
                    title={m.hint} onClick={() => setKind(m.key)}>
              {m.label}
              {(["pt", "en", "fr"] as Lang[]).some((l) => isCustom(m.key, l, settings)) && <i>•</i>}
            </button>
          ))}
        </div>
        <div className="msg-langs">
          {LANGS.map((l) => (
            <button key={l.key} type="button" aria-pressed={lang === l.key}
                    onClick={() => setLang(l.key)}>
              {l.label}
              {isCustom(kind, l.key, settings) && <i>•</i>}
            </button>
          ))}
        </div>
      </div>

      <p className="note">
        {MESSAGE_KINDS.find((m) => m.key === kind)?.hint}
        {custom
          ? " You have rewritten this one."
          : " This is the built-in wording — edit it and yours will be used instead."}
      </p>

      <textarea
        ref={box}
        className="msg-box"
        rows={14}
        value={text}
        spellCheck={false}
        onChange={(e) => write(e.target.value)}
      />

      <div className="msg-vars">
        {VARIABLES.map((v) => (
          <button key={v.name} type="button" title={v.what} onClick={() => insert(v.name)}>
            {`{{${v.name}}}`}
          </button>
        ))}
      </div>

      <div className="msg-acts">
        <button className="btn" type="button" disabled={!custom}
                onClick={() => write("")}>
          Back to the built-in wording
        </button>
        <button className="btn" type="button"
                onClick={() => write(DEFAULTS[kind][lang])}>
          Start from the built-in wording
        </button>
      </div>

      <div className="subhead label">How it will read</div>
      <pre className="msg-preview">{preview || "(nothing — every line lost its values)"}</pre>
      <p className="note">
        Built from {quotes?.length ? "one of your own quotes" : "an example quote"}. A line
        whose values are all missing is dropped, so a trip with no time recorded will not
        leave a half-finished sentence.
      </p>
    </div>
  );
}
