/**
 * Amounts in plain words, so a misplaced zero is obvious: "5000000" kobo is
 * "fifty thousand naira". Works on digit strings only (never Number on money).
 * British and Nigerian usage: "one hundred and fifty thousand".
 */

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = ["", "thousand", "million", "billion", "trillion", "quadrillion"];

/** 1 to 99, from two digits. */
function belowHundred(digits: string): string {
  const n = Number.parseInt(digits, 10); // at most 99: a count, not money
  if (n < 20) return ONES[n] ?? "";
  const tens = TENS[Math.floor(n / 10)] ?? "";
  return n % 10 === 0 ? tens : `${tens}-${ONES[n % 10]}`;
}

/** 1 to 999, from a three-digit group. */
function group(digits: string): string {
  const padded = digits.padStart(3, "0");
  const hundreds = Number.parseInt(padded.slice(0, 1), 10);
  const rest = padded.slice(1);
  const restWords = /^0+$/.test(rest) ? "" : belowHundred(rest);
  if (hundreds === 0) return restWords;
  const head = `${ONES[hundreds]} hundred`;
  return restWords ? `${head} and ${restWords}` : head;
}

/** Whole naira in words: "150250" -> "one hundred and fifty thousand, two hundred and fifty". */
export function wholeNumberInWords(digits: string): string {
  if (!/^\d+$/.test(digits)) throw new Error("Expected a digit string");
  const trimmed = digits.replace(/^0+(?=\d)/, "");
  if (trimmed === "0") return ONES[0] ?? "zero";

  const groups: string[] = [];
  for (let end = trimmed.length; end > 0; end -= 3) {
    groups.unshift(trimmed.slice(Math.max(0, end - 3), end));
  }
  if (groups.length > SCALES.length) throw new Error("Number too large");

  const parts: string[] = [];
  groups.forEach((g, i) => {
    if (/^0+$/.test(g)) return;
    const scale = SCALES[groups.length - 1 - i];
    parts.push(scale ? `${group(g)} ${scale}` : group(g));
  });

  // "one million and five": a last group under a hundred joins with "and", not a comma.
  const last = groups[groups.length - 1] ?? "";
  if (parts.length > 1 && !/^0+$/.test(last) && Number.parseInt(last, 10) < 100) {
    const tail = parts.pop();
    return `${parts.join(", ")} and ${tail}`;
  }
  return parts.join(", ");
}

/** "5000000" kobo -> "fifty thousand naira"; kobo remainders as "and fifty kobo". */
export function nairaInWords(kobo: string): string {
  if (!/^\d+$/.test(kobo)) throw new Error("Kobo must be a digit string");
  const value = BigInt(kobo);
  const naira = (value / 100n).toString();
  const rest = (value % 100n).toString().padStart(2, "0");
  const nairaWords = `${wholeNumberInWords(naira)} naira`;
  return rest === "00" ? nairaWords : `${nairaWords} and ${belowHundred(rest)} kobo`;
}

/** Amounts from this size up get the words line (100,000 naira). */
export const WORDS_FROM_KOBO = 10_000_000n;
