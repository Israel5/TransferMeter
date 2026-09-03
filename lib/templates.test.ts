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
