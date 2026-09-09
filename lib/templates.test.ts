import { describe, it, expect } from "vitest";
import { buildMessage, renderTemplate, templateFor, isCustom, DEFAULTS as T } from "./templates";
import type { MessageKind } from "./templates";
import type { Lang, Quote, Settings } from "./types";

const S = { bizName: "Israel Pereira" } as Settings;
const q = {
  customer: "Nara Portella", lang: "pt" as Lang, quoteNo: "2026-009",
  pax: { adults: 2, children: 1 }, gear: {}, bags: { checked: 2 },
  trips: [{ label: "Outbound", date: "2026-09-08", time: "17:00", price: 60,
            paxKm: 22.1, paxMins: 47, totalKm: 48.2,
            stops: [{ name: "Casa", base: true }, { name: "83 8e Rue, Laval" },
                    { name: "YUL" }, { name: "Casa", base: true }] }],
} as unknown as Quote;
const link = "https://x/quote/abc";

describe("the built-in wording", () => {
  it("has a version of every message in every language", () => {
    for (const k of ["quote", "reminder", "onway", "owed"] as MessageKind[]) {
      for (const l of ["pt", "en", "fr"] as Lang[]) {
        expect(templateFor(k, l, S).length).toBeGreaterThan(30);
      }
    }
  });

  it("is Brazilian, not Lisbon", () => {
    const pt = Object.values(T).map((byLang) => byLang.pt).join("\n");
    for (const lisbon of ["utilizador", "telemóvel", "registar", "A enviar", "-lhe"]) {
      expect(pt).not.toContain(lisbon);
    }
  });

  it("fills a reminder in", () => {
    const m = buildMessage("reminder", q, q.trips[0], link, S, "pt", { when: "tomorrow" });
    expect(m).toContain("Olá Nara!");
    expect(m).toContain("terça-feira, 8 de setembro");
    expect(m).toContain(link);
  });
});

describe("your own wording", () => {
  it("is used instead, and only where you wrote one", () => {
    const mine = { ...S, templates: { reminder: { pt: "Oi {{first_name}}, {{when}} às {{time}}." } } };
    expect(buildMessage("reminder", q, q.trips[0], link, mine, "pt", { when: "tomorrow" }))
      .toBe("Oi Nara, amanhã às 17:00.");
    expect(isCustom("reminder", "pt", mine)).toBe(true);
    expect(isCustom("reminder", "en", mine)).toBe(false);
  });

  it("comes back to the built-in one when cleared", () => {
    const blank = { ...S, templates: { reminder: { pt: "   " } } };
    expect(templateFor("reminder", "pt", blank)).toContain("Passando pra lembrar");
  });
});

describe("values that are not there", () => {
  it("drops a line rather than sending half a sentence", () => {
    const noTime = { ...q, trips: [{ ...q.trips[0], time: "", date: "" }] } as Quote;
    const m = buildMessage("reminder", noTime, noTime.trips[0], link, S, "pt", { when: "tomorrow" });
    expect(m).not.toMatch(/às\s*\./);
    expect(m).not.toMatch(/,\s*,/);
    expect(m).toContain("Olá Nara!");
  });

  it("leaves an unknown name visible rather than removing it silently", () => {
    expect(renderTemplate("A {{nmae}} B", { name: "x" })).toBe("A {{nmae}} B");
  });
});

describe("a quote that has more than one leg", () => {
  const twoLegs = (): Quote => ({
    ...q,
    trips: [
      { ...q.trips[0], label: "Outbound", date: "2026-09-12", time: "06:00", price: 40,
        stops: [{ name: "Home", base: true }, { name: "70 Rue Saint-Ferdinand" },
                { name: "YUL — Montréal-Trudeau Airport" }, { name: "Home", base: true }] },
      { ...q.trips[0], label: "Return", date: "2026-09-17", time: "00:40", price: 40,
        stops: [{ name: "Home", base: true }, { name: "YUL — Montréal-Trudeau Airport" },
                { name: "70 Rue Saint-Ferdinand" }, { name: "Home", base: true }] },
    ],
  } as unknown as Quote);

  // The fault: a return trip printed the outbound route and the total for both,
  // so the customer saw one journey priced at twice what it looked like.
  it("shows every leg, not only the first", () => {
    const m = buildMessage("quote", twoLegs(), twoLegs().trips[0], "L", S, "pt");
    expect(m).toContain("70 Rue Saint-Ferdinand → YUL");
    expect(m).toContain("YUL → 70 Rue Saint-Ferdinand");
    expect(m).toContain("sábado, 12 de setembro, às 06:00");
    expect(m).toContain("quinta-feira, 17 de setembro, às 00:40");
  });

  it("names each leg and prices it, so the total adds up on the page", () => {
    const m = buildMessage("quote", twoLegs(), twoLegs().trips[0], "L", S, "pt");
    expect(m).toContain("*Ida*");
    expect(m).toContain("*Volta*");
    expect(m.match(/\$40/g)).toHaveLength(2);
    expect(m).toContain("Total: $80");
  });

  it("says it in the customer's own language", () => {
    expect(buildMessage("quote", twoLegs(), undefined, "L", S, "en")).toContain("*Outbound*");
    expect(buildMessage("quote", twoLegs(), undefined, "L", S, "fr")).toContain("*Retour*");
  });

  // A lone journey has nothing to tell apart, and "Outbound" on its own would
  // imply a return that was never quoted.
  it("leaves the label and the per-leg price off a single journey", () => {
    const one = { ...twoLegs(), trips: [twoLegs().trips[0]] };
    const m = buildMessage("quote", one, one.trips[0], "L", S, "pt");
    expect(m).not.toContain("*Ida*");
    expect(m).toContain("70 Rue Saint-Ferdinand → YUL");
    expect(m).toContain("Total: $40");
  });

  // The reminder is about one journey by design: it goes out the day before it.
  it("leaves the per-leg messages alone", () => {
    const m = buildMessage("reminder", twoLegs(), twoLegs().trips[1], "L", S, "pt",
                           { when: "tomorrow" });
    expect(m).toContain("YUL");
    expect(m).not.toContain("*Ida*");
  });
});
