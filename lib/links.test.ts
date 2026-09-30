import { describe, it, expect } from "vitest";
import { namedAddress } from "./maps";
import { wazeLink, customerStops, mapsLink, cleanFlightNo, flightRadarLink, isFlightNo } from "./links";

describe("handing an address to the car", () => {
  it("uses the pin when the stop has one", () => {
    const url = wazeLink({ name: "YUL", lat: 45.4657, lng: -73.7455 })!;
    expect(url).toContain("ll=45.4657,-73.7455");
    expect(url).toContain("navigate=yes");
  });

  it("falls back to the written address, escaped", () => {
    const url = wazeLink({ name: "83 8e Rue, Laval, QC" })!;
    expect(url).toContain("q=83%208e%20Rue%2C%20Laval%2C%20QC");
  });

  it("prefers the pin, because a name can match more than one place", () => {
    const url = wazeLink({ name: "Rue Sherbrooke", lat: 45.5, lng: -73.6 })!;
    expect(url).toContain("ll=");
    expect(url).not.toContain("q=");
  });

  it("gives nothing rather than a link that goes nowhere", () => {
    expect(wazeLink(null)).toBeNull();
    expect(wazeLink({ name: "   " })).toBeNull();
    expect(wazeLink({ name: "", lat: 0, lng: 0 })).toBeNull();
  });
});

describe("which stops a customer's route is between", () => {
  const stops = [
    { name: "Home", base: true },
    { name: "83 8e Rue, Laval" },
    { name: "YUL" },
    { name: "Home", base: true },
  ];

  it("skips the driver's own, at both ends", () => {
    const { from, to } = customerStops(stops);
    expect(from!.name).toBe("83 8e Rue, Laval");
    expect(to!.name).toBe("YUL");
  });

  it("copes with a route that has none", () => {
    const { from, to } = customerStops([{ name: "Home", base: true }]);
    expect(from).toBeNull();
    expect(to).toBeNull();
  });
});

describe("an address a customer can check", () => {
  it("opens the written address on Google Maps, postal code and all", () => {
    const url = mapsLink("70 Rue Saint-Ferdinand, Montreal, QC H4C 2S5, Canada");
    expect(url).toContain("google.com/maps/search/");
    expect(url).toContain("H4C%202S5");
  });

  it("has nothing to open for a stop with no address", () => {
    expect(mapsLink("")).toBeNull();
    expect(mapsLink("   ")).toBeNull();
    expect(mapsLink(null)).toBeNull();
  });
});

describe("writing an address out in full", () => {
  it("keeps a place's own name when the address does not carry it", () => {
    expect(namedAddress("École Sainte-Béatrice", "5409 Rue de Prince-Rupert, Laval, QC H7K 2L7, Canada"))
      .toBe("École Sainte-Béatrice, 5409 Rue de Prince-Rupert, Laval, QC H7K 2L7, Canada");
  });

  it("does not write a house number twice", () => {
    expect(namedAddress("70 Rue Saint-Ferdinand #103", "70 Rue Saint-Ferdinand #103, Montreal, QC H4C 2S5, Canada"))
      .toBe("70 Rue Saint-Ferdinand #103, Montreal, QC H4C 2S5, Canada");
  });

  it("copes with either half being missing", () => {
    expect(namedAddress("", "83 8e Rue, Laval, QC H7N 2C5, Canada")).toBe("83 8e Rue, Laval, QC H7N 2C5, Canada");
    expect(namedAddress("YUL", "")).toBe("YUL");
  });
});

/* A flight number, and the board it opens.
 *
 * The number is typed by a customer on a phone, so it arrives with spaces,
 * lower case, and sometimes a sentence around it. What is stored has to be
 * the form a board wants, and what is linked has to be a real flight or no
 * link at all -- a dead link on a quote is worse than a plain number. */
describe("flight numbers", () => {
  it("keeps the form a departure board uses, whatever was typed", () => {
    expect(cleanFlightNo(" ac 878 ")).toBe("AC878");
    expect(cleanFlightNo("tp-1234")).toBe("TP1234");
    expect(cleanFlightNo("")).toBe("");
    expect(cleanFlightNo(undefined)).toBe("");
  });

  it("links a real flight number to its board", () => {
    expect(flightRadarLink("AC878")).toBe("https://www.flightradar24.com/data/flights/ac878");
    expect(flightRadarLink(" ac 878 ")).toBe("https://www.flightradar24.com/data/flights/ac878");
    // Three-character airline codes and the trailing letter some carriers use
    expect(flightRadarLink("TAP1234")).toBe("https://www.flightradar24.com/data/flights/tap1234");
    // Airline codes that carry a digit of their own, like easyJet's U2
    expect(flightRadarLink("U2 1234")).toBe("https://www.flightradar24.com/data/flights/u21234");
    expect(flightRadarLink("9W12")).toBe("https://www.flightradar24.com/data/flights/9w12");
    expect(flightRadarLink("LH8A")).toBe("https://www.flightradar24.com/data/flights/lh8a");
  });

  // Worth storing, not worth sending anywhere.
  it("gives no link at all to something that is not a flight number", () => {
    expect(flightRadarLink("the 6am from Lisbon")).toBeNull();
    expect(flightRadarLink("AC")).toBeNull();
    // No airline code is all digits: IATA hands out two characters with a
    // letter in them, ICAO three letters. Loosely written, this earns a link
    // to a page that does not exist.
    expect(flightRadarLink("12345")).toBeNull();
    expect(flightRadarLink("")).toBeNull();
    expect(flightRadarLink(undefined)).toBeNull();
  });

  it("agrees with itself about what is linkable", () => {
    for (const v of ["AC878", "tp 1234", "LH8A"]) {
      expect(isFlightNo(v)).toBe(true);
      expect(flightRadarLink(v)).not.toBeNull();
    }
    for (const v of ["", "AC", "hello"]) {
      expect(isFlightNo(v)).toBe(false);
      expect(flightRadarLink(v)).toBeNull();
    }
  });
});
