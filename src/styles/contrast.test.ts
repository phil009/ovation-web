import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/contrast";

const css = readFileSync(path.join(__dirname, "tokens.css"), "utf8");

function theme(name: string): Record<string, string> {
  const block = new RegExp(String.raw`/\* @theme ${name} \*/([\s\S]*?)/\* @end \*/`).exec(css)?.[1];
  if (!block) throw new Error(`theme block ${name} not found in tokens.css`);
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2]]),
  ) as Record<string, string>;
}

const TEXT = 4.5;
const UI = 3;

/** [foreground, background, minimum ratio, what it is] */
const pairings: [string, string, number, string][] = [
  ["text", "bg", TEXT, "body text"],
  ["text", "surface", TEXT, "text on cards"],
  ["text-muted", "bg", TEXT, "secondary text"],
  ["text-muted", "surface", TEXT, "secondary text on cards"],
  ["primary", "bg", TEXT, "links"],
  ["primary", "surface", TEXT, "links on cards"],
  ["on-primary", "primary", TEXT, "primary button"],
  ["on-accent", "accent", TEXT, "gold fill with ink"],
  ["on-success", "success", TEXT, "success fill"],
  ["on-danger", "danger", TEXT, "danger button"],
  ["success", "surface", TEXT, "success text"],
  ["danger", "bg", TEXT, "error text"],
  ["danger", "surface", TEXT, "error text on cards"],
  ["pledged-fg", "pledged-bg", TEXT, "Pledged badge"],
  ["received-fg", "received-bg", TEXT, "Received badge"],
  ["border", "bg", UI, "input borders"],
  ["border", "surface", UI, "input borders on cards"],
  ["ring", "bg", UI, "focus ring"],
  ["ring", "surface", UI, "focus ring on cards"],
  ["danger", "surface", UI, "invalid field border"],
];

describe.each(["light", "dark", "dark-system"])("%s theme", (name) => {
  const tokens = theme(name);

  it.each(pairings)("%s on %s is at least %d:1 (%s)", (fg, bg, min) => {
    const f = tokens[fg];
    const b = tokens[bg];
    expect(f, `--${fg} missing`).toBeDefined();
    expect(b, `--${bg} missing`).toBeDefined();
    expect(contrastRatio(f!, b!)).toBeGreaterThanOrEqual(min);
  });
});

describe("tokens.css", () => {
  it("keeps the system dark block identical to the forced dark block", () => {
    expect(theme("dark-system")).toEqual(theme("dark"));
  });

  it("matches the measured reference ratios", () => {
    expect(contrastRatio("#1b1b2f", "#faf7f0")).toBeCloseTo(15.8, 0);
    expect(contrastRatio("#ffffff", "#2e2a72")).toBeCloseTo(12.4, 0);
  });
});
