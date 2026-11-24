import { z } from "zod";

// No JIT: zod would probe `new Function`, which the CSP (no unsafe-eval) blocks and reports.
z.config({ jitless: true });

/**
 * Public environment, validated once. Only NEXT_PUBLIC_API_URL reaches the browser.
 * It must be referenced literally (process.env.NEXT_PUBLIC_API_URL) so Next can inline it.
 */
const schema = z.object({
  NEXT_PUBLIC_API_URL: z
    .url({ protocol: /^https?$/ })
    .transform((v) => v.replace(/\/+$/, ""))
    .refine((v) => !/\/api$/.test(v), "Use the server origin, without /api"),
});

const parsed = schema.safeParse({ NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL });

if (!parsed.success) {
  throw new Error(
    `Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}. ` +
      "Copy .env.example to .env.local and fill it in.",
  );
}

export const env = parsed.data;

/** Origin of the API, for CSP connect-src. */
export const apiOrigin = new URL(env.NEXT_PUBLIC_API_URL).origin;
