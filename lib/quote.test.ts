import { describe, it, expect } from "vitest";
import {
  bandPrice, orderedBands, fuelUsed, legCost, measuredAverage,
  toL100, toKmPerL, customerRoute, scheduleFor,
} from "./quote";
import type { Band, SavedTrip, Settings, Trip } from "./types";

const S = (over: Partial<Settings> = {}): Settings => ({
  homeName: "Home", homeLat: 45.4962, homeLng: -73.6515,
  bizName: "", bizPhone: "", bizWhats: "", customerPage: "",
  kmPerL: 5, fuelPrice: 2, roadFactor: 1.55,
  avgSpeed: 55, waitPerStop: 10, seats: 7, leaveBuffer: 20,
  countryCode: "1",
  bands: [{ upTo: 45, price: 50 }, { upTo: 75, price: 60 }, { upTo: null, price: 70 }],
  ...over,
});

describe("price bands", () => {
  it("prices by the band the distance falls in, limits inclusive", () => {
    const s = S();
    expect(bandPrice(30, s).price).toBe(50);
    expect(bandPrice(45, s).price).toBe(50);
    expect(bandPrice(46, s).price).toBe(60);
    expect(bandPrice(75, s).price).toBe(60);
    expect(bandPrice(120, s).price).toBe(70);
  });

  it("takes as many bands as you give it", () => {
    const s = S({ bands: [
      { upTo: 20, price: 40 }, { upTo: 45, price: 50 }, { upTo: 75, price: 60 },
      { upTo: 120, price: 80 }, { upTo: null, price: 110 },
    ] });
    expect(bandPrice(15, s).price).toBe(40);
    expect(bandPrice(100, s).price).toBe(80);
    expect(bandPrice(300, s).price).toBe(110);
  });

  it("reads them in order however they were typed", () => {
    const s = S({ bands: [
      { upTo: null, price: 70 }, { upTo: 75, price: 60 }, { upTo: 45, price: 50 },
    ] });
    expect(orderedBands(s).map((b: Band) => b.upTo)).toEqual([45, 75, null]);
    expect(bandPrice(30, s).price).toBe(50);
  });

  it("does not fall through to nothing when every band has a limit", () => {
    const s = S({ bands: [{ upTo: 45, price: 50 }] });
    expect(bandPrice(500, s).price).toBe(50);
  });

  it("survives having no bands at all", () => {
    expect(bandPrice(50, S({ bands: [] })).price).toBe(0);
  });
});

describe("fuel", () => {
  it("converts between the dash and the settings", () => {
    expect(toL100(5)).toBe(20);
    expect(toKmPerL(20)).toBe(5);
  });

  it("is null when nothing was measured, so an estimate can be told apart", () => {
    expect(fuelUsed(undefined, 31.4, S())).toBeNull();
    expect(fuelUsed({}, 31.4, S())).toBeNull();
    expect(fuelUsed({ km: 0 }, 31.4, S())).toBeNull();
  });

  it("works the real reading out", () => {
    const r = fuelUsed({ km: 42.4, l100: 13.2, price: 1.879 }, 0, S())!;
    expect(r.litres).toBeCloseTo(5.5968, 3);
    expect(r.cost).toBeCloseTo(10.5163, 3);
  });

  it("falls back field by field to what was assumed", () => {
    expect(fuelUsed({ km: 31.4 }, 99, S())!.cost).toBeCloseTo(12.56, 2);
    expect(fuelUsed({ l100: 19.8 }, 31.4, S())!.cost).toBeCloseTo(12.4344, 3);
    expect(fuelUsed({ price: 1.75 }, 31.4, S())!.cost).toBeCloseTo(10.99, 2);
  });

  it("counts a reading that lands on the estimate as a reading", () => {
    const r = fuelUsed({ l100: 20 }, 31.4, S())!;
    expect(r.measured.l100).toBe(true);
    expect(r.measured.km).toBe(false);
  });

  it("uses the measurement where there is one and the estimate otherwise", () => {
    const leg = { cost: 12.56, totalKm: 31.4 } as SavedTrip;
    expect(legCost(leg, S()).cost).toBeCloseTo(12.56, 2);
    expect(legCost({ ...leg, actual: { l100: 24.5 } }, S()).cost).toBeCloseTo(15.386, 2);
  });

  it("averages by distance, not by trip", () => {
    const quotes = [{ trips: [
      { totalKm: 10, actual: { l100: 30 } },
      { totalKm: 190, actual: { l100: 18 } },
      { totalKm: 50 },
    ] }] as never;
    const m = measuredAverage(quotes)!;
    expect(m.n).toBe(2);
    expect(m.km).toBe(200);
    expect(m.l100).toBeCloseTo(18.6, 3);
  });
});

describe("what a customer is shown", () => {
  it("names the driver's own stops by their part, never by address", () => {
    const stops = [
      { name: "503-7407 Av Mountain Sights", base: true },
      { name: "1500 Sherbrooke" },
      { name: "YUL" },
      { name: "503-7407 Av Mountain Sights", base: true },
    ];
    const v = customerRoute(stops, [12, 18, 14],
      { startPoint: "Starting point", endPoint: "End point" } as never);
    expect(v.stops).toEqual(["Starting point", "1500 Sherbrooke", "YUL", "End point"]);
    expect(JSON.stringify(v)).not.toContain("Mountain Sights");
    expect(v.km).toBeCloseTo(44, 5);
  });
});

describe("when to leave", () => {
  const trip = (over: Partial<Trip> = {}): Trip => ({
    label: "Outbound", date: "2026-09-08", time: "17:00",
    stops: [
      { name: "Home", base: true }, { name: "Laval" }, { name: "YUL" }, { name: "Home", base: true },
    ],
    liveLegs: [{ km: 14.7, mins: 20 }, { km: 22.1, mins: 47 }, { km: 11.4, mins: 18 }],
    priceOverride: null,
    ...over,
  });

  it("leaves early enough for the drive to their door plus the buffer", () => {
    const s = scheduleFor(trip(), S(), {})!;
    expect(s.pickup.getHours()).toBe(17);
    // 20 min to the door + 20 min of slack
    expect(s.leave.getHours()).toBe(16);
    expect(s.leave.getMinutes()).toBe(20);
  });

  it("says nothing when there is no time to work from", () => {
    expect(scheduleFor(trip({ time: "" }), S(), {})).toBeNull();
  });
});
