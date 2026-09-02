"use client";

import type { Settings } from "@/lib/types";

const NUM: [keyof Settings, string, string][] = [
  ["kmPerL", "Km per litre", "Dodge Journey 3.6 ≈ 5"],
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
  settings, learnedCount, onChange, onClearLearned,
}: {
  settings: Settings; learnedCount: number;
  onChange: (patch: Partial<Settings>) => void;
  onClearLearned: () => void;
}) {
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
    <details className="settings">
      <summary><span className="label">Car, fuel &amp; price bands</span></summary>
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
          Never shown on screen or to a customer — the route says “Starting point”. It is sent
          to Google so distances are accurate.
        </p>

        <div className="subhead label">Car &amp; fuel</div>
        <div className="fields">{NUM.map(([k, l, h]) => num(k, l, h))}
          {text("countryCode", "Default country code", "1 = Canada")}
        </div>

        <div className="subhead label">Price bands</div>
        <div className="fields">{BANDS.map(([k, l]) => num(k, l))}</div>

        <div className="subhead label">Learned distances</div>
        <p className="note">
          {learnedCount === 0
            ? "None yet. Type a real distance into any leg and it will be reused every time you drive that pair."
            : `${learnedCount} corrected distance${learnedCount > 1 ? "s" : ""} remembered and reused instead of estimates.`}
        </p>
        <div className="route-actions" style={{ borderTop: 0, paddingTop: 4 }}>
          <button className="btn" type="button" onClick={onClearLearned}>Forget corrected distances</button>
        </div>
      </div>
    </details>
  );
}
