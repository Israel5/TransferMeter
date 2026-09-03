import { describe, it, expect } from "vitest";
import { initialState, saveQuote, hasUnsavedChanges, loadQuote, withQuote } from "./state";
import type { AppState } from "./state";
import type { Quote, Stop } from "./types";

const stops: Stop[] = [
  { name: "Home", base: true }, { name: "1500 Sherbrooke" },
  { name: "YUL" }, { name: "Home", base: true },
];

const saved = (over: Partial<Quote> = {}): Quote => ({
  id: 10, quoteNo: "2026-010", savedAt: "2026-09-03T10:00:00Z", status: "sent",
  customer: "Pedro", contact: "", notes: "", origin: "driver", lang: "pt",
  pax: { adults: 2 }, gear: {}, bags: {},
  trips: [{
    label: "Outbound", date: "2026-09-03", time: "10:00", stops,
    legKm: [12, 18, 14], totalKm: 44, mins: 95, cost: 17.6, price: 50,
    paxKm: 18, paxMins: 32, tip: 0, paid: false, override: null,
  }],
  totalKm: 44, cost: 17.6, price: 50, mins: 95, keep: 32.4,
  ...over,
});

const editing = (q: Quote): AppState => ({
  ...initialState(),
  quotes: [q], editingId: q.id, quoteNo: q.quoteNo,
  customer: q.customer, contact: q.contact, notes: q.notes, lang: q.lang,
  pax: q.pax, gear: q.gear, bags: q.bags,
  trips: q.trips.map((t) => ({
    legId: t.legId,
    label: t.label, date: t.date, time: t.time, stops: t.stops,
    liveLegs: null, priceOverride: t.price,
  })),
});

describe("unsaved changes", () => {
  it("is quiet when nothing has been touched", () => {
    expect(hasUnsavedChanges(editing(saved()))).toBe(false);
  });

  it("notices the things a driver would call a change", () => {
    const base = editing(saved());
    const priced = { ...base, trips: [{ ...base.trips[0], priceOverride: 58 }] };
    expect(hasUnsavedChanges(priced)).toBe(true);
    expect(hasUnsavedChanges({ ...base, customer: "Pedro S" })).toBe(true);
    expect(hasUnsavedChanges({ ...base, notes: "gate code" })).toBe(true);
    expect(hasUnsavedChanges({ ...base, pax: { adults: 3 } })).toBe(true);
    expect(hasUnsavedChanges({ ...base, trips: [{ ...base.trips[0], time: "11:00" }] })).toBe(true);
  });

  it("does not cry wolf on a re-render or on stray whitespace", () => {
    const base = editing(saved());
    expect(hasUnsavedChanges({ ...base })).toBe(false);
    expect(hasUnsavedChanges({ ...base, customer: " Pedro " })).toBe(false);
  });
});

describe("saving", () => {
  it("refuses a trip with no named stop at all", () => {
    const bare = initialState();
    const st = {
      ...bare,
      trips: [{ ...bare.trips[0], stops: bare.trips[0].stops.map((s) => ({ ...s, name: s.base ? s.name : "" })) }],
    };
    expect(saveQuote(st).ok).toBe(false);
  });

  it("accepts the default route, which already names the airport", () => {
    // Worth knowing: the guard asks for any named stop, not for a customer
    // pickup, so a fresh quote is saveable before you have typed an address.
    expect(saveQuote(initialState()).ok).toBe(true);
  });

  it("carries tips, payments and fuel readings across a revision", () => {
    const q = saved();
    q.trips[0].tip = 10;
    q.trips[0].paid = true;
    q.trips[0].actual = { km: 42.4, l100: 13.2, price: 1.879 };
    const st = editing(q);
    const r = saveQuote({ ...st, trips: [{ ...st.trips[0], priceOverride: 58 }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.content.trips[0].tip).toBe(10);
    expect(r.content.trips[0].paid).toBe(true);
    expect(r.content.trips[0].actual).toEqual({ km: 42.4, l100: 13.2, price: 1.879 });
    expect(r.content.trips[0].price).toBe(58);
  });

  it("knows whether it is revising or creating", () => {
    const st = editing(saved());
    const revising = saveQuote(st);
    expect(revising.ok && revising.editing?.id).toBe(10);

    const fresh = saveQuote({ ...st, editingId: null });
    expect(fresh.ok && fresh.editing).toBeNull();
  });
});

describe("opening and folding back", () => {
  it("pins the fare that was quoted rather than re-deriving it", () => {
    const st = loadQuote(editing(saved()), 10);
    expect(st.trips[0].priceOverride).toBe(50);
    expect(st.editingId).toBe(10);
  });

  it("does nothing for a quote that is not there", () => {
    const st = editing(saved());
    expect(loadQuote(st, 999)).toBe(st);
  });

  it("folds a saved quote back in and stops it reading as unsaved", () => {
    const st = { ...editing(saved()), editingId: null, quotes: [] };
    const next = withQuote(st, saved());
    expect(next.quotes).toHaveLength(1);
    expect(next.editingId).toBe(10);
    expect(hasUnsavedChanges(next)).toBe(false);
  });
});

describe("payments follow their own leg, not a position", () => {
  const round = (): Quote => {
    const q = saved();
    q.trips = [
      { ...q.trips[0], legId: "out", label: "Outbound", date: "2026-09-03", price: 50, tip: 5, paid: false },
      { ...q.trips[0], legId: "ret", label: "Return", date: "2026-09-10", price: 50, tip: 0, paid: true,
        actual: { km: 42.4, l100: 13.2, price: 1.879 } },
    ];
    return q;
  };

  it("keeps the return's payment on the return when the outbound is deleted", () => {
    const q = round();
    const st = editing(q);
    // Drop the outbound, as "Remove this leg" does.
    const after = saveQuote({ ...st, trips: [st.trips[1]] });
    expect(after.ok).toBe(true);
    if (!after.ok) return;

    expect(after.content.trips).toHaveLength(1);
    const kept = after.content.trips[0];
    expect(kept.legId).toBe("ret");
    expect(kept.paid).toBe(true);                       // the return was paid
    expect(kept.tip).toBe(0);                           // and had no tip
    expect(kept.actual).toEqual({ km: 42.4, l100: 13.2, price: 1.879 });
  });

  it("keeps them in place when the legs are reordered", () => {
    const q = round();
    const st = editing(q);
    const after = saveQuote({ ...st, trips: [st.trips[1], st.trips[0]] });
    expect(after.ok).toBe(true);
    if (!after.ok) return;

    const [first, second] = after.content.trips;
    expect(first.legId).toBe("ret");
    expect(first.paid).toBe(true);
    expect(second.legId).toBe("out");
    expect(second.tip).toBe(5);
    expect(second.paid).toBe(false);
  });

  it("still matches by position for legs saved before ids existed", () => {
    const q = saved();
    q.trips[0].tip = 7;
    delete (q.trips[0] as { legId?: string }).legId;
    const st = editing(q);
    delete (st.trips[0] as { legId?: string }).legId;
    const after = saveQuote(st);
    expect(after.ok && after.content.trips[0].tip).toBe(7);
  });
});
