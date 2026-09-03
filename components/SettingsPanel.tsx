"use client";

import { fmt, measuredAverage, toL100, toKmPerL } from "@/lib/quote";
import { MessageEditor } from "./MessageEditor";
import type { Quote, Settings } from "@/lib/types";

const NUM: [keyof Settings, string, string][] = [
  ["fuelPrice", "Fuel price / L", ""],
  ["roadFactor", "Road factor", "Straight line → real roads"],
  ["avgSpeed", "Avg speed km/h", ""],
  ["waitPerStop", "Min. per stop", "Loading bags, waiting"],
  ["leaveBuffer", "Leave early by", "Minutes of slack"],
  ["seats", "Seats in the car", "Journey = 7"],
];
const BANDS: [keyof Settings, string][] = [
  ["t1max", "Band 1 up to (km)"], ["t1", "Band 1 price"],
  ["t2max", "Band 2 up to (km)"], ["t2", "Band 2 price"], ["t3", "Above that"],
];

export function SettingsPanel({
  settings, learnedCount, quotes, onChange, onClearLearned, onSignOut,
}: {
  settings: Settings; learnedCount: number; quotes: Quote[];
  onChange: (patch: Partial<Settings>) => void;
  onClearLearned: () => void;
  onSignOut: () => void;
}) {
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
      <input id={`s-${k}`} type="number" step="0.01" inputMode="decimal" value={String(settings[k] ?? "")}
             onChange={(e) => {
               const v = parseFloat(e.target.value);
               if (Number.isFinite(v)) onChange({ [k]: v } as Partial<Settings>);
             }} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );

  return (
    <section className="settings open">
      <div className="settings-body">
        <div className="subhead label">Your details (shown on the PDF)</div>
        <div className="fields">
          {text("bizName", "Name or business")}
          {text("bizPhone", "Phone or contact", "Printed on the PDF, free text")}
          {text("bizWhats", "Your WhatsApp number", "Where customers' answers are sent")}
          {text("customerPage", "Customer page address",
                "Where the approve/decline page is hosted", { style: { gridColumn: "1/-1" } })}
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

        <div className="subhead label">Car &amp; fuel</div>
        <div className="fields">
          <div className="field">
            <label className="label" htmlFor="s-l100">Consumption</label>
            <input id="s-l100" type="number" step="0.1" inputMode="decimal"
                   value={settings.kmPerL > 0 ? String(Math.round(toL100(settings.kmPerL) * 10) / 10) : ""}
                   onChange={(e) => {
                     const v = parseFloat(e.target.value);
                     if (Number.isFinite(v) && v > 0) onChange({ kmPerL: toKmPerL(v) });
                   }} />
            <span className="hint">
              {`L/100 km, as the dash shows it — ${fmt(settings.kmPerL, 1)} km/L. Journey 3.6 ≈ 20`}
            </span>
          </div>
          {NUM.map(([k, l, h]) => num(k, l, h))}
          {text("countryCode", "Default country code", "1 = Canada")}
        </div>
        {real && (
          <p className="note">
            {`Across the ${real.n} ride${real.n > 1 ? "s" : ""} you measured — ${fmt(real.km, 0)} km — the car actually did `}
            <b>{`${fmt(real.l100, 1)} L/100 km`}</b>
            {` (${fmt(real.kmPerL, 1)} km/L). `}
            {Math.abs(drift) < 0.5
              ? "That matches what you have set."
              : `That is ${fmt(Math.abs(drift), 1)} L/100 km ${drift > 0 ? "thirstier" : "leaner"} than your setting, so untouched trips are costed ${drift > 0 ? "too cheaply" : "too dearly"}.`}
            {Math.abs(drift) >= 0.5 && (
              <>
                {" "}
                <button className="btn" type="button" style={{ marginLeft: 6 }}
                        onClick={() => onChange({ kmPerL: real.kmPerL })}>
                  {`Use ${fmt(real.l100, 1)} instead`}
                </button>
              </>
            )}
          </p>
        )}

        <div className="subhead label">Price bands</div>
        <div className="fields">{BANDS.map(([k, l]) => num(k, l))}</div>

        <div className="subhead label">Messages to customers</div>
        <MessageEditor settings={settings} quotes={quotes}
                       onChange={(templates) => onChange({ templates })} />

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
      </div>
    </section>
  );
}
