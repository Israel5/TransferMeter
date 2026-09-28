"use client";

import { useEffect, useMemo, useState } from "react";
import { SLOT_IDS, type Counts, type SlotId, type Slots } from "@/lib/types";

/* The back of the car, from above, with the child seats put where they go.
 *
 * The counts beside this say what to bring; this says where it is strapped
 * in. It never invents a device: every chip it offers was asked for by a
 * count, so the two can't drift apart. Leaving a seat empty is an answer --
 * "wherever you like" -- and not an unfinished form, so nothing here blocks
 * sending.
 *
 * Only the two window places of the middle row accept one. The third row has
 * no tether to anchor to and the middle of the bench is too narrow to take a
 * seat beside another, so both are drawn but neither can be chosen: a car
 * missing its own seats reads as a drawing of some other car.
 */

const DEVICES = ["infantSeat", "carSeat", "booster"] as const;
type Device = (typeof DEVICES)[number];

const T = {
  pt: {
    title: "Onde ficam as cadeirinhas",
    hint: "Toque no lugar onde você quer cada uma. Só os dois lugares da janela do banco do meio levam cadeirinha.",
    left: "Esquerda", right: "Direita",
    behindDriver: "atrás do motorista", behindPax: "atrás do passageiro",
    put: "Colocar à", clear: "Tirar daqui", cancel: "Deixa pra lá",
    driver: "Motorista", front: "Passageiro", noSeat: "Não leva cadeirinha",
    free: "Livre", anywhere: "Sem preferência de lado — eu escolho um bom lugar.",
    tooMany: "São mais cadeirinhas do que cabem no banco de trás. Vou falar com você.",
    infantSeat: "Bebê conforto", carSeat: "Cadeirinha", booster: "Assento de elevação",
  },
  en: {
    title: "Where the child seats go",
    hint: "Tap the place you'd like each one. Only the two window places of the middle row take a child seat.",
    left: "Left", right: "Right",
    behindDriver: "behind the driver", behindPax: "behind the front passenger",
    put: "Put on the", clear: "Take this one out", cancel: "Never mind",
    driver: "Driver", front: "Front passenger", noSeat: "No child seat here",
    free: "Free", anywhere: "No preference — I'll pick a good spot.",
    tooMany: "That's more child seats than the back of the car can take. I'll be in touch.",
    infantSeat: "Infant seat", carSeat: "Car seat", booster: "Booster",
  },
  fr: {
    title: "Où vont les sièges enfant",
    hint: "Touchez la place souhaitée pour chacun. Seules les deux places côté fenêtre de la rangée du milieu peuvent en recevoir.",
    left: "Gauche", right: "Droite",
    behindDriver: "derrière le conducteur", behindPax: "derrière le passager",
    put: "Mettre à", clear: "Retirer d'ici", cancel: "Laisser tomber",
    driver: "Conducteur", front: "Passager avant", noSeat: "Pas de siège enfant ici",
    free: "Libre", anywhere: "Pas de préférence — je choisis une bonne place.",
    tooMany: "Cela dépasse ce que la banquette arrière peut recevoir. Je vous contacte.",
    infantSeat: "Siège bébé", carSeat: "Siège d'auto", booster: "Siège d'appoint",
  },
};

type Lang = keyof typeof T;

/** The counts, spread into one entry per device, in the order they are
 *  listed. Two boosters are two chips, because they go in two places. */
function wantedFrom(gear: Counts): Device[] {
  const out: Device[] = [];
  for (const d of DEVICES) for (let i = 0; i < (gear[d] ?? 0); i++) out.push(d);
  return out;
}

/** What has been asked for but not yet put anywhere. A multiset difference:
 *  two boosters with one placed leaves one still to place, not none. */
function unplacedFrom(wanted: Device[], slots: Slots): Device[] {
  const left = [...wanted];
  for (const id of SLOT_IDS) {
    const d = slots[id];
    if (!d) continue;
    const i = left.indexOf(d as Device);
    if (i >= 0) left.splice(i, 1);
  }
  return left;
}

/** Placements the counts no longer pay for. Lowering a count to zero must not
 *  leave its chip strapped into a seat, where nothing on screen would explain
 *  it and the driver would load a seat nobody asked for. */
function prune(slots: Slots, wanted: Device[]): Slots {
  const budget = [...wanted];
  const kept: Slots = {};
  for (const id of SLOT_IDS) {
    const d = slots[id];
    if (!d) continue;
    const i = budget.indexOf(d as Device);
    if (i >= 0) { budget.splice(i, 1); kept[id] = d; }
  }
  return kept;
}

export function SeatMap({
  gear, slots, lang, onChange,
}: {
  gear: Counts;
  slots: Slots;
  lang: Lang;
  /** Absent means the map is a picture of a decision already made. */
  onChange?: (next: Slots) => void;
}) {
  const L = T[lang] ?? T.pt;
  const editable = typeof onChange === "function";
  const [choosing, setChoosing] = useState<SlotId | null>(null);

  const wanted = useMemo(() => wantedFrom(gear), [gear]);
  const clean = useMemo(() => prune(slots, wanted), [slots, wanted]);
  const unplaced = useMemo(() => unplacedFrom(wanted, clean), [wanted, clean]);

  // Dropping a count is a change to the placements too, and the parent owns
  // them. Comparing the serialised pair keeps this from chasing its own tail.
  const pruned = JSON.stringify(clean);
  useEffect(() => {
    if (!onChange) return;
    if (pruned !== JSON.stringify(slots)) onChange(JSON.parse(pruned));
  }, [pruned, slots, onChange]);

  // A seat that can't be filled shouldn't be offering to open a menu.
  useEffect(() => {
    if (choosing && (!editable || unplaced.length === 0)) setChoosing(null);
  }, [choosing, editable, unplaced.length]);

  // Nothing asked for, nothing to place, nothing to draw. An empty car is a
  // question with no answer to give, and it reads as a step that was missed.
  // Kept here rather than at each call site so the four of them cannot
  // disagree about when it appears.
  if (wanted.length === 0) return null;

  const overflow = wanted.length > SLOT_IDS.length;

  const pick = (id: SlotId) => {
    if (!onChange) return;
    if (clean[id]) {                       // tapping a full seat empties it
      const next = { ...clean }; delete next[id];
      setChoosing(null); onChange(next);
      return;
    }
    if (unplaced.length === 0) return;
    const kinds = [...new Set(unplaced)];
    if (kinds.length === 1) {              // only one thing it could be
      setChoosing(null); onChange({ ...clean, [id]: kinds[0] });
      return;
    }
    setChoosing((c) => (c === id ? null : id));
  };

  const place = (id: SlotId, d: Device) => {
    if (!onChange) return;
    setChoosing(null);
    onChange({ ...clean, [id]: d });
  };

  const sideOf = (id: SlotId) => (id === "2L" ? L.left : L.right);
  const whereOf = (id: SlotId) => (id === "2L" ? L.behindDriver : L.behindPax);

  const label = (id: SlotId) => {
    const d = clean[id] as Device | undefined;
    const where = `${sideOf(id)} — ${whereOf(id)}`;
    return d ? `${L[d]}, ${where}` : `${L.free}, ${where}`;
  };

  return (
    <div className="sm">
      <h3 className="sm-h">{L.title}</h3>

      <div className="sm-car">
        <svg viewBox="0 0 220 400" className="sm-svg" role="img"
             aria-label={SLOT_IDS.map(label).join(". ")}>
          {/* tyres, so the shape reads as a car and not a phone */}
          {[96, 268].map((y) => (
            <g key={y} className="sm-tyre">
              <rect x="11" y={y} width="15" height="46" rx="7" />
              <rect x="194" y={y} width="15" height="46" rx="7" />
            </g>
          ))}

          <rect x="22" y="12" width="176" height="376" rx="42" className="sm-body" />
          <path d="M56 106 L164 106 L150 70 Q110 60 70 70 Z" className="sm-glass" />
          <path d="M62 352 L158 352 L150 378 Q110 386 70 378 Z" className="sm-glass" />

          {/* front row: whose car it is, not a choice to make */}
          <ellipse cx="70" cy="126" rx="13" ry="9" className="sm-wheel" />
          <FixedSeat cx={70} cy={154} />
          <FixedSeat cx={152} cy={154} />

          {/* middle row: the bench. Outboard chooses, middle cannot. */}
          <FixedSeat cx={110} cy={246} dim />
          {(["2L", "2R"] as SlotId[]).map((id) => (
            <LiveSeat
              key={id}
              cx={id === "2L" ? 60 : 160}
              cy={246}
              device={clean[id] as Device | undefined}
              open={choosing === id}
              editable={editable}
              offering={editable && unplaced.length > 0}
              label={label(id)}
              onPick={() => pick(id)}
            />
          ))}

          {/* third row */}
          <FixedSeat cx={76} cy={324} dim />
          <FixedSeat cx={144} cy={324} dim />
        </svg>
      </div>

      {editable && choosing && (
        <div className="sm-pick" role="group"
             aria-label={`${L.put} ${sideOf(choosing).toLowerCase()}`}>
          <span className="sm-pick-h">{L.put} {sideOf(choosing).toLowerCase()}:</span>
          {[...new Set(unplaced)].map((d) => (
            <button key={d} type="button" className="sm-chip"
                    onClick={() => place(choosing, d)}>
              <Glyph device={d} inline />{L[d]}
            </button>
          ))}
          <button type="button" className="sm-chip ghost"
                  onClick={() => setChoosing(null)}>{L.cancel}</button>
        </div>
      )}

      <ul className="sm-legend">
        {SLOT_IDS.map((id) => {
          const d = clean[id] as Device | undefined;
          return (
            <li key={id} className={d ? "on" : ""}>
              <span className="sm-legend-side">{sideOf(id)}</span>
              <span className="sm-legend-what">{d ? L[d] : L.free}</span>
            </li>
          );
        })}
      </ul>

      {overflow && <p className="cq-warn">{L.tooMany}</p>}
      {!overflow && editable && unplaced.length > 0 && <p className="sm-note">{L.hint}</p>}
      {!overflow && !editable && unplaced.length === wanted.length && (
        <p className="sm-note">{L.anywhere}</p>
      )}
    </div>
  );
}

/** A seat that is part of the car rather than part of the question. */
function FixedSeat({ cx, cy, dim }: { cx: number; cy: number; dim?: boolean }) {
  return (
    <g className={dim ? "sm-seat off" : "sm-seat fixed"}>
      <rect x={cx - 12} y={cy + 12} width="24" height="11" rx="5" />
      <rect x={cx - 17} y={cy - 19} width="34" height="36" rx="9" />
    </g>
  );
}

function LiveSeat({
  cx, cy, device, open, editable, offering, label, onPick,
}: {
  cx: number; cy: number;
  device?: Device;
  open: boolean; editable: boolean; offering: boolean;
  label: string;
  onPick: () => void;
}) {
  const live = editable && (offering || !!device);
  const cls = ["sm-seat", "live", device ? "full" : "empty", open ? "open" : "", live ? "" : "idle"]
    .filter(Boolean).join(" ");
  return (
    <g className={cls}
       role={live ? "button" : undefined}
       tabIndex={live ? 0 : undefined}
       aria-label={live ? label : undefined}
       aria-pressed={live ? !!device : undefined}
       onClick={live ? onPick : undefined}
       onKeyDown={live ? (e) => {
         if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(); }
       } : undefined}>
      <rect x={cx - 12} y={cy + 12} width="24" height="11" rx="5" />
      <rect x={cx - 17} y={cy - 19} width="34" height="36" rx="9" />
      {device
        ? <Glyph device={device} cx={cx} cy={cy - 1} />
        : live && <g className="sm-plus">
            <rect x={cx - 7} y={cy - 1.4} width="14" height="2.8" rx="1.4" />
            <rect x={cx - 1.4} y={cy - 7} width="2.8" height="14" rx="1.4" />
          </g>}
    </g>
  );
}

/** Three shapes you can tell apart at the size of a fingertip: the carrier
 *  shell with its handle, the high-backed seat with wings, the flat cushion. */
function Glyph({ device, cx = 0, cy = 0, inline }: {
  device: Device; cx?: number; cy?: number; inline?: boolean;
}) {
  const body = (
    <g className="sm-glyph">
      {device === "infantSeat" && (<>
        <ellipse cx={cx} cy={cy + 2} rx="10" ry="12" />
        <path d={`M${cx - 10} ${cy} Q${cx} ${cy - 17} ${cx + 10} ${cy}`} className="stroke" />
      </>)}
      {device === "carSeat" && (<>
        <rect x={cx - 11} y={cy - 12} width="22" height="24" rx="6" />
        <rect x={cx - 6} y={cy - 7} width="12" height="15" rx="4" className="hollow" />
      </>)}
      {device === "booster" && (<>
        <rect x={cx - 12} y={cy + 1} width="24" height="10" rx="4" />
        <rect x={cx - 11} y={cy - 8} width="22" height="7" rx="3.5" />
      </>)}
    </g>
  );
  if (!inline) return body;
  return (
    <svg viewBox={`${-16} ${-16} 32 32`} className="sm-glyph-inline" aria-hidden="true">
      {body}
    </svg>
  );
}
