import { describe, expect, it } from "vitest";
import type { OutboxEntry } from "@/lib/db";
import { csvCell, koboToNaira, unsentCsv } from "./export";

describe("CSV export of unsent donations", () => {
  it("keeps money exact", () => {
    expect(koboToNaira("5000000")).toBe("50000");
    expect(koboToNaira("5000050")).toBe("50000.50");
    expect(koboToNaira("999999999999999999")).toBe("9999999999999999.99");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("Okafor, Ngozi")).toBe('"Okafor, Ngozi"');
    expect(csvCell('Chief "Odogwu"')).toBe('"Chief ""Odogwu"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });

  it("never lets a cell become a spreadsheet formula", () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell("+234 803")).toBe("'+234 803");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell("@sum")).toBe("'@sum");
  });

  it("writes a header and one row per entry, UTF-8 with a BOM", () => {
    const entry: OutboxEntry = {
      id: "d-1",
      userId: "u-1",
      orgId: "o-1",
      eventId: "e-1",
      body: {
        id: "d-1",
        eventId: "e-1",
        awardeeId: "a-1",
        donorName: "Nnamdi Ọkọnkwọ",
        amountKobo: "5000000",
        paymentMode: "TRANSFER",
        needsReview: true,
      },
      who: "2. Lolo Ada",
      eventName: "Anambra Day",
      status: "attention",
      problem: "The event is closed.",
      attempts: 1,
      createdAt: Date.UTC(2026, 10, 8, 18, 30),
    };
    const csv = unsentCsv([entry]);
    expect(csv.startsWith("﻿Event,For,Donor,Amount (naira)")).toBe(true);
    expect(csv).toContain(
      "Anambra Day,2. Lolo Ada,Nnamdi Ọkọnkwọ,50000,Transfer,Yes,,2026-11-08T18:30:00.000Z,Needs attention,The event is closed.,d-1\r\n",
    );
  });
});
