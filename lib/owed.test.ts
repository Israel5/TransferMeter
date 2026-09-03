import { describe, it, expect } from "vitest";
import { owedRuns, runsOn, isoDay } from "@/components/Dashboard";
import type { Quote, Settings } from "./types";

const day = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const leg = (date: string, paid: boolean, price: number) => ({
  label: "Outbound", date, time: "10:00", paid, price, tip: 0,
  stops: [{ name: "Home", base: true }, { name: "A" }, { name: "B" }, { name: "Home", base: true }],
  legKm: [1, 2, 3], totalKm: 6, mins: 30, cost: 2, paxKm: 2, paxMins: 10, override: null,
});

const quotes = [
  { id: 1, customer: "Driven, unpaid",    status: "approved", trips: [leg(day(-9), false, 50)] },
  { id: 2, customer: "Driven, paid",      status: "approved", trips: [leg(day(-3), true, 50)] },
  { id: 3, customer: "Booked next month", status: "approved", trips: [leg(day(28), false, 50)] },
  { id: 4, customer: "Today, not yet run", status: "approved", trips: [leg(day(0), false, 50)] },
  { id: 5, customer: "Never approved",    status: "sent",     trips: [leg(day(-5), false, 50)] },
  { id: 6, customer: "Older, unpaid",     status: "approved", trips: [leg(day(-40), false, 40)] },
] as unknown as Quote[];

const S = {} as Settings;

describe("what you are owed", () => {
  const owed = owedRuns(quotes, S, {});
  const who = owed.map((r) => r.quote.customer);

  it("counts trips already driven and not paid for", () => {
    expect(who).toContain("Driven, unpaid");
    expect(who).toContain("Older, unpaid");
  });

  it("is not a list of work in the diary", () => {
    // A booking next month is not a debt; counting it turns a number worth
    // acting on into one you learn to ignore.
    expect(who).not.toContain("Booked next month");
    expect(who).not.toContain("Today, not yet run");
  });

  it("leaves out what is paid, and what was never agreed", () => {
    expect(who).not.toContain("Driven, paid");
    expect(who).not.toContain("Never approved");
  });

  it("puts the oldest first, because that is the one to ask about", () => {
    expect(who[0]).toBe("Older, unpaid");
  });

  it("totals only what was driven", () => {
    expect(owed.reduce((n, r) => n + (r.trip.price ?? 0), 0)).toBe(90);
  });
});

describe("the day's work", () => {
  it("shows a trip booked for today, answered or not", () => {
    const today = runsOn(quotes, isoDay(0), S, {});
    expect(today.map((r) => r.quote.customer)).toContain("Today, not yet run");
  });

  it("leaves out a quote nobody has answered as declined or draft", () => {
    const declined = [{ id: 9, customer: "No", status: "declined", trips: [leg(isoDay(0), false, 50)] }] as unknown as Quote[];
    expect(runsOn(declined, isoDay(0), S, {})).toHaveLength(0);
  });
});
