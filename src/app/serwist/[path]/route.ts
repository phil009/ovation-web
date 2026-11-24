import { createSerwistRoute } from "@serwist/turbopack";

// The revision only needs to change between builds; a random value per build is fine.
const revision = crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    swSrc: "src/app/sw.ts",
    additionalPrecacheEntries: [{ url: "/offline", revision }],
    // Native esbuild works on Windows without install scripts (the binary ships as an
    // optional dependency).
    useNativeEsbuild: true,
    // Default globs: .next/static/** and public/** only. Never HTML with data, never API responses.
  },
);
