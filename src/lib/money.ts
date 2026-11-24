/**
 * Money is kobo (1 naira = 100 kobo) carried as a digit string end to end, e.g. "5000000" = ₦50,000.
 * Arithmetic uses BigInt only. Never call Number() on kobo.
 */

/** The API's pattern for a positive amount (CreateDonationDto.amountKobo in the OpenAPI document). */
export const KOBO_PATTERN = /^[1-9]\d{0,17}$/;

export type NairaParseError =
  "empty" | "invalid" | "negative" | "zero" | "leadingZero" | "fraction" | "tooLarge";

export type NairaParseResult = { ok: true; kobo: string } | { ok: false; error: NairaParseError };

const MULTIPLIERS: Record<string, bigint> = { "": 1n, k: 1_000n, m: 1_000_000n };

/**
 * Parses what an organiser types for a whole-naira amount.
 * Accepts "50000", "50,000", "₦50,000", "50k", "1.5m". Whole naira only for now.
 */
export function parseNairaInput(raw: string): NairaParseResult {
  let input = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (input === "") return { ok: false, error: "empty" };
  if (input.startsWith("-")) return { ok: false, error: "negative" };
  input = input.replace(/^₦/, "").replace(/naira$/, "");

  const match = /^(\d[\d,]*)(?:\.(\d+))?([km]?)$/.exec(input);
  if (!match) return { ok: false, error: "invalid" };
  const [, intRaw = "", fracRaw = "", suffix = ""] = match;

  if (intRaw.includes(",") && !/^\d{1,3}(,\d{3})+$/.test(intRaw)) {
    return { ok: false, error: "invalid" };
  }
  const intPart = intRaw.replace(/,/g, "");
  // "0.5m" is fine; "050000" and "00.5m" are not.
  if (intPart.length > 1 && intPart.startsWith("0")) return { ok: false, error: "leadingZero" };

  // A decimal point is only meaningful with a k or m suffix. "50.000" could mean fifty or
  // fifty thousand, so refuse to guess.
  if (fracRaw && !suffix) return { ok: false, error: "fraction" };

  const multiplier = MULTIPLIERS[suffix] ?? 1n;
  const scale = 10n ** BigInt(fracRaw.length);
  const scaled = BigInt(intPart) * scale + (fracRaw ? BigInt(fracRaw) : 0n);
  const nairaTimesScale = scaled * multiplier;

  if (nairaTimesScale % scale !== 0n) return { ok: false, error: "fraction" };
  const naira = nairaTimesScale / scale;
  if (naira === 0n) return { ok: false, error: "zero" };

  const kobo = (naira * 100n).toString();
  if (!KOBO_PATTERN.test(kobo)) return { ok: false, error: "tooLarge" };
  return { ok: true, kobo };
}

function toBigInt(kobo: string): bigint {
  if (!/^-?\d+$/.test(kobo)) throw new Error("Kobo must be a digit string");
  return BigInt(kobo);
}

/** Sum of kobo strings, as a kobo string. */
export function sumKobo(values: readonly string[]): string {
  return values.reduce((total, v) => total + toBigInt(v), 0n).toString();
}

function decimalString(kobo: string): string {
  const value = toBigInt(kobo);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const rest = abs % 100n;
  const fraction = rest === 0n ? "" : `.${rest.toString().padStart(2, "0")}`;
  return `${negative ? "-" : ""}${abs / 100n}${fraction}`;
}

const currency = { style: "currency", currency: "NGN", currencyDisplay: "narrowSymbol" } as const;
const wholeFormat = new Intl.NumberFormat("en-NG", { ...currency, maximumFractionDigits: 0 });
const koboFormat = new Intl.NumberFormat("en-NG", { ...currency, minimumFractionDigits: 2 });
const groupedWhole = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });
const groupedKobo = new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2 });

const hasKobo = (kobo: string) => toBigInt(kobo) % 100n !== 0n;

// Intl.NumberFormat formats decimal strings exactly (Intl.NumberFormat v3), with no float
// conversion. The type definitions only declare number | bigint, hence the cast.
type DecimalString = `${number}`;
const exact = (kobo: string) => decimalString(kobo) as DecimalString;

/** "5000000" -> "₦50,000". Kobo remainders show as decimals ("₦50,000.50"). */
export function formatNaira(kobo: string): string {
  return (hasKobo(kobo) ? koboFormat : wholeFormat).format(exact(kobo));
}

/** Read-aloud form for screen readers: "5000000" -> "50,000 naira". */
export function spokenNaira(kobo: string): string {
  return `${(hasKobo(kobo) ? groupedKobo : groupedWhole).format(exact(kobo))} naira`;
}
