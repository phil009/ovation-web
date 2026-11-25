import { describe, expect, it } from "vitest";
import { nairaInWords, wholeNumberInWords } from "./naira-words";
import {
  GENERAL,
  donationCreateBody,
  donationSchema,
  donationToValues,
  donationUpdateBody,
  type DonationDto,
  type DonationValues,
} from "./validation";

describe("amounts in words", () => {
  it.each([
    ["0", "zero"],
    ["7", "seven"],
    ["15", "fifteen"],
    ["40", "forty"],
    ["99", "ninety-nine"],
    ["100", "one hundred"],
    ["105", "one hundred and five"],
    ["1000", "one thousand"],
    ["1005", "one thousand and five"],
    ["100000", "one hundred thousand"],
    ["150250", "one hundred and fifty thousand, two hundred and fifty"],
    ["1000005", "one million and five"],
    ["2500000", "two million, five hundred thousand"],
    ["12000000000", "twelve billion"],
  ])("%s -> %s", (digits, words) => {
    expect(wholeNumberInWords(digits)).toBe(words);
  });

  it("reads kobo strings as naira", () => {
    expect(nairaInWords("10000000")).toBe("one hundred thousand naira");
    expect(nairaInWords("5000050")).toBe("fifty thousand naira and fifty kobo");
    // The largest amount the API accepts (18 digits of kobo).
    expect(nairaInWords("999999999999999900")).toMatch(/^nine quadrillion, /);
  });

  it("refuses anything that is not digits", () => {
    expect(() => nairaInWords("1e5")).toThrow();
    expect(() => wholeNumberInWords("-5")).toThrow();
  });
});

const values: DonationValues = {
  awardeeId: "a-1",
  donorName: "  Mrs Ngozi Okafor ",
  amount: "50k",
  paymentMode: "CASH",
  status: "RECEIVED",
  needsReview: false,
  note: "  ",
};

describe("donation bodies", () => {
  it("validates like the backend", () => {
    expect(donationSchema.safeParse(values).success).toBe(true);
    expect(donationSchema.safeParse({ ...values, amount: "" }).success).toBe(false);
    expect(donationSchema.safeParse({ ...values, amount: "0" }).success).toBe(false);
    expect(donationSchema.safeParse({ ...values, donorName: " " }).success).toBe(false);
    expect(donationSchema.safeParse({ ...values, donorName: "x".repeat(201) }).success).toBe(false);
    expect(donationSchema.safeParse({ ...values, note: "x".repeat(501) }).success).toBe(false);
  });

  it("builds the create body with the client id, trimmed, without empty extras", () => {
    expect(donationCreateBody(values, { id: "id-1", eventId: "e-1" })).toEqual({
      id: "id-1",
      eventId: "e-1",
      awardeeId: "a-1",
      donorName: "Mrs Ngozi Okafor",
      amountKobo: "5000000",
      paymentMode: "CASH",
    });
  });

  it("sends null for a general donation, and the flag and note when set", () => {
    const body = donationCreateBody(
      { ...values, awardeeId: GENERAL, needsReview: true, note: " smudged " },
      { id: "id-1", eventId: "e-1" },
    );
    expect(body.awardeeId).toBeNull();
    expect(body.needsReview).toBe(true);
    expect(body.note).toBe("smudged");
  });

  it("builds the update body with the version; only a pledge keeps its status", () => {
    expect(donationUpdateBody({ ...values, status: "PLEDGED" }, 3)).toEqual({
      version: 3,
      awardeeId: "a-1",
      donorName: "Mrs Ngozi Okafor",
      amountKobo: "5000000",
      paymentMode: "CASH",
      status: "RECEIVED",
      needsReview: false,
      note: "",
    });
    const pledge = donationUpdateBody({ ...values, paymentMode: "PLEDGE", status: "PLEDGED" }, 3);
    expect(pledge.status).toBe("PLEDGED");
  });

  const saved: DonationDto = {
    id: "id-1",
    eventId: "e-1",
    awardeeId: "a-1",
    donorName: "Mrs Ngozi Okafor",
    amountKobo: "5000000",
    paymentMode: "CASH",
    status: "RECEIVED",
    needsReview: false,
    note: null,
    version: 1,
    createdById: "u-1",
    createdAt: "2026-11-08T10:00:00.000Z",
    updatedAt: "2026-11-08T10:00:00.000Z",
  };

  it("turns a donation back into form values", () => {
    expect(donationToValues({ ...saved, awardeeId: null })).toEqual({
      awardeeId: GENERAL,
      donorName: "Mrs Ngozi Okafor",
      amount: "50000",
      paymentMode: "CASH",
      status: "RECEIVED",
      needsReview: false,
      note: "",
    });
  });
});
