"use client";

import { Main, PageHeading, PublicHeader } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Money, Notice, StatusBadge } from "@/components/ui/misc";
import { PasswordField } from "@/components/ui/password-field";
import { applyTheme } from "@/lib/theme";

const GLYPHS = "Ọnụ Ịkọ Ṅwụrụ ₦50,000";
const WEIGHTS = [400, 500, 600, 700] as const;
const TOKENS = [
  "bg",
  "surface",
  "text",
  "text-muted",
  "primary",
  "on-primary",
  "accent",
  "on-accent",
  "success",
  "on-success",
  "danger",
  "on-danger",
  "pledged-bg",
  "pledged-fg",
  "received-bg",
  "received-fg",
  "border",
  "divider",
  "ring",
];

// Static class lists so Tailwind generates them (no dynamic class names or inline styles,
// which the CSP blocks).
const weightClass = {
  400: "font-normal",
  500: "font-medium",
  600: "font-semibold",
  700: "font-bold",
};
const swatchClass: Record<string, string> = {
  bg: "bg-bg",
  surface: "bg-surface",
  text: "bg-text",
  "text-muted": "bg-muted",
  primary: "bg-primary",
  "on-primary": "bg-on-primary",
  accent: "bg-accent",
  "on-accent": "bg-on-accent",
  success: "bg-success",
  "on-success": "bg-on-success",
  danger: "bg-danger",
  "on-danger": "bg-on-danger",
  "pledged-bg": "bg-pledged-bg",
  "pledged-fg": "bg-pledged-fg",
  "received-bg": "bg-received-bg",
  "received-fg": "bg-received-fg",
  border: "bg-border",
  divider: "bg-divider",
  ring: "bg-ring",
};

export function DesignSheet() {
  return (
    <>
      <PublicHeader />
      <Main>
        <PageHeading intro="Development only. Tokens, type, components and the glyph test.">
          Design sheet
        </PageHeading>

        <div className="mb-8 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => applyTheme("light")}>
            Light
          </Button>
          <Button variant="secondary" onClick={() => applyTheme("dark")}>
            Dark
          </Button>
          <Button variant="secondary" onClick={() => applyTheme("system")}>
            Match device
          </Button>
        </div>

        <section aria-labelledby="glyphs" className="mb-10">
          <h2 id="glyphs" className="mb-4 text-2xl font-semibold">
            Glyph test
          </h2>
          <table className="w-full border-collapse text-left">
            <caption className="mb-2 text-left text-muted">
              Igbo dotted vowels, ṅ and the naira sign in every font and weight used.
            </caption>
            <thead>
              <tr className="border-b border-divider">
                <th scope="col" className="py-2 pr-4">
                  Font
                </th>
                <th scope="col" className="py-2 pr-4">
                  Weight
                </th>
                <th scope="col" className="py-2">
                  Sample
                </th>
              </tr>
            </thead>
            <tbody>
              {(["font-sans", "font-serif"] as const).flatMap((family) =>
                WEIGHTS.map((weight) => (
                  <tr key={`${family}-${weight}`} className="border-b border-divider">
                    <th scope="row" className="py-2 pr-4 font-normal">
                      {family === "font-sans" ? "Inter" : "Fraunces"}
                    </th>
                    <td className="py-2 pr-4 tabular">{weight}</td>
                    <td className={`py-2 text-2xl ${family} ${weightClass[weight]}`} lang="ig">
                      {GLYPHS}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </section>

        <section aria-labelledby="type" className="mb-10 flex flex-col gap-2">
          <h2 id="type" className="mb-2 text-2xl font-semibold">
            Type scale
          </h2>
          <p className="font-serif text-4xl font-semibold">Heading 1 · Anambra Day</p>
          <p className="font-serif text-3xl font-semibold">Heading 2 · Awardees</p>
          <p className="font-serif text-2xl font-semibold">Heading 3 · Supporters</p>
          <p className="text-lg">Large body: the quick brown fox.</p>
          <p>Body (17px): Chief Emeka Obi gave by transfer.</p>
          <p className="text-sm text-muted">Small muted: last synced a minute ago.</p>
          <p className="text-3xl font-semibold">
            <Money kobo="317000000" />
          </p>
        </section>

        <section aria-labelledby="colours" className="mb-10">
          <h2 id="colours" className="mb-4 text-2xl font-semibold">
            Colour tokens
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {TOKENS.map((token) => (
              <li key={token} className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={`ov-border size-10 shrink-0 rounded-lg border border-border ${swatchClass[token]}`}
                />
                <code className="text-sm">--{token}</code>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="components" className="mb-10 flex flex-col gap-6">
          <h2 id="components" className="text-2xl font-semibold">
            Components
          </h2>
          <div className="flex flex-wrap gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap gap-3">
            <StatusBadge status="PLEDGED" />
            <StatusBadge status="RECEIVED" />
          </div>
          <div className="flex max-w-md flex-col gap-5">
            <TextField
              id="demo-name"
              label="Donor name"
              hint="As written in the notebook."
              autoComplete="off"
            />
            <TextField
              id="demo-amount"
              label="Amount"
              inputMode="numeric"
              error="Enter an amount like 50,000 or 50k."
              required
            />
            <PasswordField id="demo-password" label="Password" autoComplete="off" />
          </div>
          <Notice>Information notice.</Notice>
          <Notice tone="success">Saved.</Notice>
          <Notice tone="warning">Waking the server. This can take a minute.</Notice>
          <Notice tone="error">Something went wrong.</Notice>
          <p className="ov-border border-b-4 border-accent pb-1 font-serif text-xl">
            Gold as a decorative line
          </p>
          <p className="inline-block self-start rounded-lg bg-accent px-3 py-1 font-semibold text-on-accent">
            Gold fill, ink text
          </p>
        </section>
      </Main>
    </>
  );
}
