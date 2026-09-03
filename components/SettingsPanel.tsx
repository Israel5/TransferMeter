"use client";

import { fmt, measuredAverage, toL100, toKmPerL } from "@/lib/quote";
import { useState } from "react";
import { MessageEditor } from "./MessageEditor";
import { BackupPanel } from "./BackupPanel";
import { BandEditor } from "./BandEditor";
import { NumberField } from "./NumberField";
import type { Quote, Settings } from "@/lib/types";

const NUM: [keyof Settings, string, string][] = [
  ["fuelPrice", "Fuel price / L", ""],
  ["roadFactor", "Road factor", "Straight line → real roads. Montréal measures 1.55"],
  ["avgSpeed", "Avg speed km/h", ""],
  ["waitPerStop", "Min. per stop", "Loading bags, waiting"],
  ["leaveBuffer", "Leave early by", "Minutes of slack"],
  ["seats", "Seats in the car", "Journey = 7"],
];
type TabKey = "you" | "car" | "prices" | "messages" | "data";
const TABS: [TabKey, string][] = [
  ["you", "You"], ["car", "Car & fuel"], ["prices", "Prices"],
  ["messages", "Messages"], ["data", "Data"],
];


export function SettingsPanel({
  settings, learnedCount, quotes, onChange, onClearLearned, onSignOut, onRestored,
}: {
  settings: Settings; learnedCount: number; quotes: Quote[];
  onChange: (patch: Partial<Settings>) => void;
  onClearLearned: () => void;
  onSignOut: () => void;
  onRestored: () => void;
}) {
  const [tab, setTab] = useState<TabKey>("you");
  // What the car has really been doing, from the rides you measured.
  const real = measuredAverage(quotes);
  const drift = real ? real.l100 - toL100(settings.kmPerL) : 0;
  const text = (k: keyof Settings, label: string, hint?: string, extra?: object) => (
    <div className="field" {...extra}>
      <label className="label" htmlFor={`s-${k}`}>{label}</label>
      <input id={`s-${k}`} type="text" value={String(settings[k] ?? "")}
             onChange={(e) => onChange({ [k]: e.target.value } as Partial<Settings>)} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
  const num = (k: keyof Settings, label: string, hint?: string) => (
    <div className="field" key={k}>
      <label className="label" htmlFor={`s-${k}`}>{label}</label>
      <NumberField
        id={`s-${k}`}
        step="0.01"
        min={-180}
        ariaLabel={label}
        value={(settings[k] as number) ?? null}
        onChange={(v) => onChange({ [k]: v } as Partial<Settings>)} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );

  return (
    <section className="settings open">
      <div className="set-tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key}
                  onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      <div className="settings-body">
      {tab === "you" && (<>
        <div className="subhead label">Your details (shown on the PDF)</div>
        <div className="fields">
          {text("bizName", "Name or business")}
          {text("bizPhone", "Phone or contact", "Printed on the PDF, free text")}
          {text("bizWhats", "Your WhatsApp number", "Where customers' answers are sent")}
          {text("customerPage", "Customer page address",
                "Where the approve page is hosted, e.g. https://…/quote", { style: { gridColumn: "1/-1" } })}
        </div>

        <div className="subhead label">Your address (private)</div>
        <div className="fields">
          {text("homeName", "Your address", undefined, { style: { gridColumn: "1/-1" } })}
          {num("homeLat", "Latitude")}
          {num("homeLng", "Longitude")}
        </div>
        <p className="note">
          Yours to see while you work. Customers never get it: their copy and the PDF say
          “Starting point” and “End point” with the distance beside them. It is sent to
          Google so distances are accurate.
        </p>
      </>)}

      {tab === "car" && (<>
        <div className="subhead label">Car &amp; fuel</div>
        <div className="fields">
          <div className="field">
            <label className="label" htmlFor="s-l100">Consumption</label>
            <NumberField
              id="s-l100"
              step="0.1"
              min={1}
              ariaLabel="Consumption in litres per 100 km"
              value={settings.kmPerL > 0 ? Math.round(toL100(settings.kmPerL) * 10) / 10 : null}
              onChange={(v) => onChange({ kmPerL: toKmPerL(v) })} />
            <span className="hint">
              {`L/100 km, as the dash shows it — ${fmt(settings.kmPerL, 1)} km/L. Journey 3.6 ≈ 20`}
            </span>
          </div>
          {NUM.map(([k, l, h]) => num(k, l, h))}
          {text("countryCode", "Default country code", "1 = Canada")}
        </div>
        {real && (
          /* The figure first, the reading of it second, the button apart from
             both. It was one long sentence with the button wedged inside it,
             which wrapped somewhere around the middle of the page and left
             the button stranded on a line of its own. */
          <div className="measured">
            <div className="measured-figure">
              {fmt(real.l100, 1)}<small>L/100 km</small>
            </div>
            <div className="measured-read">
              <b>{`${fmt(real.kmPerL, 1)} km/L`}</b>
              {` over ${real.n} ride${real.n > 1 ? "s" : ""}, ${fmt(real.km, 0)} km measured.`}
              <span>
                {Math.abs(drift) < 0.5
                  ? "That matches your setting."
                  : `${fmt(Math.abs(drift), 1)} ${drift > 0 ? "thirstier" : "leaner"} than your setting, so untouched trips cost ${drift > 0 ? "more" : "less"} than you think.`}
              </span>
            </div>
            {Math.abs(drift) >= 0.5 && (
              <button className="btn" type="button"
                      onClick={() => onChange({ kmPerL: real.kmPerL })}>
                {`Use ${fmt(real.l100, 1)}`}
              </button>
            )}
          </div>
        )}

      </>)}

      {tab === "prices" && (<>
        <div className="subhead label">Price bands</div>
        <BandEditor bands={settings.bands ?? []}
                    onChange={(bands) => onChange({ bands })} />
      </>)}

      {tab === "messages" && (
        <MessageEditor settings={settings} quotes={quotes}
                       onChange={(templates) => onChange({ templates })} />
      )}

      {tab === "data" && (<>
        <div className="subhead label">Backup</div>
        <BackupPanel onRestored={onRestored} />

        <div className="subhead label">Learned distances</div>
        <p className="note">
          {learnedCount === 0
            ? "None yet. Type a real distance into any leg and it will be reused every time you drive that pair."
            : `${learnedCount} corrected distance${learnedCount > 1 ? "s" : ""} remembered and reused instead of estimates.`}
        </p>
        <div className="route-actions" style={{ borderTop: 0, paddingTop: 4 }}>
          <button className="btn" type="button" onClick={onClearLearned}>Forget corrected distances</button>
        </div>

        <div className="subhead label">This device</div>
        <p className="note">
          Signing out clears the session on this browser only. Your trips stay where they are,
          and any customer link you have already sent keeps working.
        </p>
        <div className="route-actions" style={{ borderTop: 0, paddingTop: 4 }}>
          <button className="btn danger" type="button" onClick={onSignOut}>Sign out</button>
        </div>
      </>)}
      </div>
    </section>
  );
}
