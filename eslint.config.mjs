import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

// eslint-config-next already registers the jsx-a11y plugin, so only the
// strict rule set is layered on top (all as errors).
const a11yStrictRules = Object.fromEntries(
  Object.entries(jsxA11y.flatConfigs.strict.rules).map(([rule, setting]) => [
    rule,
    Array.isArray(setting) ? ["error", ...setting.slice(1)] : "error",
  ]),
);

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    rules: {
      ...a11yStrictRules,
      // Deprecated rule that demands nesting AND id together; its replacement
      // label-has-associated-control (either is fine) stays on as an error.
      "jsx-a11y/label-has-for": "off",
      "jsx-a11y/label-has-associated-control": ["error", { assert: "either" }],
      // Scrollable table wrappers are focusable labelled regions (axe: scrollable-region-focusable).
      "jsx-a11y/no-noninteractive-tabindex": ["error", { tags: [], roles: ["tabpanel", "region"] }],
      "react/no-danger": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
      "no-restricted-globals": [
        "error",
        {
          name: "localStorage",
          message: "Never store session data in localStorage (see docs/SECURITY.md).",
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Node scripts and test tooling may log.
    files: ["scripts/**", "e2e/**", "**/*.test.{ts,tsx}"],
    rules: { "no-console": "off" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    "src/sdk/**",
    "public/sw.js",
  ]),
]);

export default eslintConfig;
