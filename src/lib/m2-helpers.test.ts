import { describe, expect, it } from "vitest";
import { changedFields } from "./audit";
import { formatEventDate, isCalendarDay, todayLocal } from "./dates";
import {
  awardeeBody,
  awardeeSchema,
  eventSchema,
  inviteBody,
  inviteSchema,
  koboToNairaInput,
  type AwardeeValues,
} from "./validation";

describe("event dates", () => {
  it("accepts real calendar days only", () => {
    expect(isCalendarDay("2026-11-08")).toBe(true);
    expect(isCalendarDay("2028-02-29")).toBe(true);
    expect(isCalendarDay("2026-02-29")).toBe(false);
    expect(isCalendarDay("2026-13-01")).toBe(false);
    expect(isCalendarDay("8/11/2026")).toBe(false);
    expect(isCalendarDay("")).toBe(false);
  });

  it("shows the API's midnight-UTC date as the same calendar day", () => {
    expect(formatEventDate("2026-11-08T00:00:00.000Z")).toBe("Sun, 8 November 2026");
  });

  it("gives today as YYYY-MM-DD in local time", () => {
    expect(todayLocal(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });

  it("validates the event form", () => {
    expect(eventSchema.safeParse({ name: "Anambra Day", date: "2026-11-08" }).success).toBe(true);
    expect(eventSchema.safeParse({ name: "A", date: "2026-11-08" }).success).toBe(false);
    expect(eventSchema.safeParse({ name: "Anambra Day", date: "" }).success).toBe(false);
  });
});

const awardee = (over: Partial<AwardeeValues> = {}): AwardeeValues => ({
  number: "",
  name: "Chief Emeka Obi",
  amount: "",
  paymentMode: "TRANSFER",
  ...over,
});

describe("awardee form", () => {
  it("accepts a name alone", () => {
    expect(awardeeSchema.safeParse(awardee()).success).toBe(true);
    expect(awardeeBody(awardee(), "create")).toEqual({ name: "Chief Emeka Obi" });
  });

  it("sends kobo strings and the payment mode with an amount", () => {
    const values = awardee({ number: "12", amount: "3m", paymentMode: "PLEDGE" });
    expect(awardeeSchema.safeParse(values).success).toBe(true);
    expect(awardeeBody(values, "create")).toEqual({
      name: "Chief Emeka Obi",
      number: 12,
      amountKobo: "300000000",
      paymentMode: "PLEDGE",
    });
  });

  it("treats 0 as no amount, and a cleared amount on update as 0", () => {
    expect(awardeeBody(awardee({ amount: "0" }), "create")).toEqual({ name: "Chief Emeka Obi" });
    expect(awardeeBody(awardee(), "update")).toEqual({ name: "Chief Emeka Obi", amountKobo: "0" });
  });

  it("explains a bad amount or number", () => {
    const amount = awardeeSchema.safeParse(awardee({ amount: "50.000" }));
    expect(amount.success).toBe(false);
    expect(amount.error?.issues[0]?.message).toMatch(/whole naira/);
    expect(awardeeSchema.safeParse(awardee({ number: "1.5" })).success).toBe(false);
    expect(awardeeSchema.safeParse(awardee({ number: "-1" })).success).toBe(false);
    expect(awardeeSchema.safeParse(awardee({ name: "  " })).success).toBe(false);
  });

  it("turns kobo back into the amount field", () => {
    expect(koboToNairaInput("300000000")).toBe("3000000");
    expect(koboToNairaInput("0")).toBe("");
  });
});

describe("invite form", () => {
  it("leaves out an empty max uses", () => {
    const values = { role: "EDITOR" as const, maxUses: "", expiresInDays: "7" };
    expect(inviteSchema.safeParse(values).success).toBe(true);
    expect(inviteBody(values)).toEqual({ role: "EDITOR", expiresInDays: 7 });
  });

  it("checks the backend's ranges", () => {
    const base = { role: "VIEWER" as const, maxUses: "", expiresInDays: "7" };
    expect(inviteSchema.safeParse({ ...base, maxUses: "1000" }).success).toBe(true);
    expect(inviteSchema.safeParse({ ...base, maxUses: "1001" }).success).toBe(false);
    expect(inviteSchema.safeParse({ ...base, maxUses: "0" }).success).toBe(false);
    expect(inviteSchema.safeParse({ ...base, expiresInDays: "91" }).success).toBe(false);
    expect(inviteSchema.safeParse({ ...base, expiresInDays: "" }).success).toBe(false);
    expect(inviteBody({ ...base, maxUses: "5" })).toEqual({
      role: "VIEWER",
      maxUses: 5,
      expiresInDays: 7,
    });
  });
});

describe("audit changes", () => {
  it("lists only the fields that changed, formatting kobo", () => {
    const before = { id: "a1", name: "Emeka", amountKobo: "100000", updatedAt: "x", version: 1 };
    const after = {
      id: "a1",
      name: "Emeka Obi",
      amountKobo: "300000000",
      updatedAt: "y",
      version: 2,
    };
    expect(changedFields(before, after)).toEqual([
      { field: "name", before: "Emeka", after: "Emeka Obi" },
      { field: "amountKobo", before: "₦1,000", after: "₦3,000,000" },
    ]);
  });

  it("shows every field for a create, with a dash for nothing", () => {
    expect(changedFields(null, { name: "Day", closed: false, note: null })).toEqual([
      { field: "name", before: "—", after: "Day" },
      { field: "closed", before: "—", after: "false" },
    ]);
  });

  it("never throws on odd shapes", () => {
    expect(changedFields("x", [1, 2])).toEqual([]);
    expect(changedFields({ meta: { a: 1 } }, { meta: { a: 2 } })).toEqual([
      { field: "meta", before: '{"a":1}', after: '{"a":2}' },
    ]);
  });
});
