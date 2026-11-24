import { describe, expect, it } from "vitest";
import { formatNaira, parseNairaInput, spokenNaira, sumKobo } from "./money";

const ok = (kobo: string) => ({ ok: true, kobo });
const err = (error: string) => ({ ok: false, error });

describe("parseNairaInput", () => {
  it.each([
    ["50000", "5000000"],
    ["50,000", "5000000"],
    ["₦50,000", "5000000"],
    [" 50 000 ", "5000000"],
    ["100k", "10000000"],
    ["100K", "10000000"],
    ["3M", "300000000"],
    ["3m", "300000000"],
    ["1.5m", "150000000"],
    ["0.5m", "50000000"],
    ["2.5k", "250000"],
    ["1", "100"],
  ])("%s -> %s kobo", (input, kobo) => {
    expect(parseNairaInput(input)).toEqual(ok(kobo));
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["0", "zero"],
    ["0k", "zero"],
    ["-500", "negative"],
    ["050000", "leadingZero"],
    ["00.5m", "leadingZero"],
    ["1.5", "fraction"],
    ["1.2345k", "fraction"],
    ["50.000", "fraction"],
    ["1,000.5", "fraction"],
    ["5,00,000", "invalid"],
    ["abc", "invalid"],
    ["1e6", "invalid"],
    ["10kk", "invalid"],
    ["999999999999999999k", "tooLarge"],
  ])("rejects %j (%s)", (input, error) => {
    expect(parseNairaInput(input)).toEqual(err(error));
  });

  it("accepts the largest amount the API allows (18 kobo digits) and rejects one more digit", () => {
    expect(parseNairaInput("9999999999999999")).toEqual(ok("999999999999999900"));
    expect(parseNairaInput("99999999999999999")).toEqual(err("tooLarge"));
  });
});

describe("formatNaira", () => {
  it("formats whole naira with grouping", () => {
    expect(formatNaira("5000000")).toBe("₦50,000");
    expect(formatNaira("300000000")).toBe("₦3,000,000");
    expect(formatNaira("0")).toBe("₦0");
  });

  it("shows kobo remainders and stays exact beyond Number precision", () => {
    expect(formatNaira("5000050")).toBe("₦50,000.50");
    expect(formatNaira("999999999999999999")).toBe("₦9,999,999,999,999,999.99");
  });

  it("rejects non-digit strings", () => {
    expect(() => formatNaira("50.00")).toThrow();
  });
});

describe("spokenNaira", () => {
  it("reads naturally", () => {
    expect(spokenNaira("5000000")).toBe("50,000 naira");
  });
});

describe("sumKobo", () => {
  it("adds exactly with BigInt", () => {
    expect(sumKobo(["300000000", "7000000", "10000000"])).toBe("317000000");
    expect(sumKobo(["999999999999999999", "1"])).toBe("1000000000000000000");
    expect(sumKobo([])).toBe("0");
  });
});
