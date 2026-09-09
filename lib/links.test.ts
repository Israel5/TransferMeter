import { describe, it, expect } from "vitest";
import { namedAddress } from "./maps";
import { wazeLink, customerStops, mapsLink } from "./links";

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
