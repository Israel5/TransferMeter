import { describe, it, expect } from "vitest";
import { customerPayload, seatPlaces } from "./message";
import { buildPDF } from "./pdf";
import type { Quote, Settings } from "./types";

const HOME = "503-7407 Av Mountain Sights, Montréal";

const S = {
  bizName: "Israel Pereira — Transfers", bizPhone: "+1 438 778 4800", bizWhats: "14387784800",
  homeName: HOME, homeLat: 45.4962, homeLng: -73.6515, seats: 7, countryCode: "1",
} as Settings;

const q = {
  id: 9, quoteNo: "2026-009", savedAt: "2026-09-01T15:35:07Z", status: "sent",
  customer: "Nara Portella", contact: "14385551234", notes: "gate code 4432",
  origin: "driver", lang: "pt",
  pax: { adults: 2, children: 1 }, gear: {}, bags: { checked: 2 },
  trips: [{
    label: "Outbound", date: "2026-09-08", time: "17:00",
    stops: [{ name: HOME, base: true, lat: 45.4962, lng: -73.6515 },
            { name: "83 8e Rue, Laval" }, { name: "YUL" },
            { name: HOME, base: true, lat: 45.4962, lng: -73.6515 }],
    legKm: [14.7, 22.1, 11.4], totalKm: 48.2, mins: 123, cost: 19.31, price: 60,
    paxKm: 22.1, paxMins: 47, tip: 0, paid: false, override: null,
  }],
  totalKm: 48.2, cost: 19.31, price: 60, mins: 123, keep: 40.69,
} as unknown as Quote;

const view = customerPayload(q, S, (v: string) => v.replace(/\D/g, ""));

describe("what a customer is given", () => {
  const asText = JSON.stringify(view);

  it("never carries the driver's address or coordinates", () => {
    expect(asText).not.toContain("Mountain Sights");
    expect(asText).not.toContain("7407");
    expect(asText).not.toContain("45.4962");
    expect(asText).not.toContain("-73.65");
  });

  it("never carries what the trip cost the driver, or the private notes", () => {
    expect(asText).not.toContain("19.31");
    expect(asText).not.toContain("gate code");
  });

  it("does carry their own journey, and the distance the price is based on", () => {
    expect(view.c).toBe("Nara Portella");
    expect(view.t[0].pkm).toBeCloseTo(22.1, 1);
    expect(view.t[0].km).toBeCloseTo(48.2, 1);
    expect(view.tot).toBe(60);
  });

  it("dates the quote when it was written", () => {
    expect(view.savedAt).toBe("2026-09-01T15:35:07Z");
  });
});

describe("the document they can keep", () => {
  const pdf = Buffer.from(buildPDF(view)).toString("latin1");

  it("is built from the same view, so it cannot say more than the page", () => {
    expect(pdf).not.toContain("Mountain Sights");
    expect(pdf).not.toContain("7407");
    expect(pdf).not.toContain("gate code");
  });

  it("names the customer and the quote", () => {
    expect(pdf).toContain("Nara Portella");
    expect(pdf).toContain("2026-009");
  });

  it("dates it when the quote was written, not when it was printed", () => {
    expect(pdf).toContain("2026-09-01");
  });
});

describe("which stops a customer may open on a map", () => {
  // The base is in the payload as the part it plays, not as an address. If the
  // page or the PDF ever guessed instead of being told, that role name would
  // become a map search for the driver's home.
  it("marks the real addresses and never the driver's base", () => {
    expect(view.t[0].s[0]).not.toContain("Mountain Sights");
    expect(view.t[0].r).toEqual([false, true, true, false]);
  });

  it("says so for every stop of every leg", () => {
    for (const leg of view.t) expect(leg.r).toHaveLength(leg.s.length);
  });
});

/* Which door to open.
 *
 * A count says to bring two seats; only this says which side each one goes.
 * It is the one part of the booking a stepper could never carry, so it is the
 * part most worth pinning down. */
describe("where the child seats go", () => {
  it("names the side for each one, in the customer's language", () => {
    expect(seatPlaces({ "2L": "carSeat", "2R": "booster" },
                      { carSeat: 1, booster: 1 }, "pt"))
      .toBe("Esquerda: cadeirinha · Direita: booster");
    expect(seatPlaces({ "2R": "infantSeat" }, { infantSeat: 1 }, "en"))
      .toBe("Right: infant seat");
  });

  it("says nothing when no side was chosen, rather than saying nothing was", () => {
    expect(seatPlaces({}, { booster: 1 }, "pt")).toBe("");
    expect(seatPlaces(undefined, { booster: 1 }, "en")).toBe("");
  });

  // A stale draft can hold a placement whose count has since gone to zero.
  // The database drops those; so must the line the driver loads the car from.
  it("ignores a seat the counts no longer pay for", () => {
    expect(seatPlaces({ "2L": "carSeat", "2R": "booster" },
                      { carSeat: 1, booster: 0 }, "en"))
      .toBe("Left: car seat");
  });
});

/* The flight and whose the seats are, on their own copy.
 *
 * Both used to live in the driver's private notes, which the customer link
 * deliberately never carries -- so putting them in named fields is what makes
 * them visible to the one person who can say they are wrong. */
describe("the flight, on the customer's sheet", () => {
  const flying = customerPayload(
    { ...q, ownSeats: true,
      trips: [{ ...q.trips[0], flight: "AC878" }, { ...q.trips[0], label: "Return", flight: "ac 879" }],
    } as unknown as Quote,
    S, (v: string) => v.replace(/\D/g, ""));

  it("carries each leg's own flight, in the form a board uses", () => {
    expect(flying.t[0].f).toBe("AC878");
    expect(flying.t[1].f).toBe("AC879");
  });

  it("says nothing at all when no flight was given", () => {
    expect(view.t[0].f).toBeUndefined();
  });

  it("carries whose child seats they are", () => {
    expect(flying.xc.ownSeats).toBe(true);
    expect(view.xc.ownSeats).toBe(false);
  });
});
