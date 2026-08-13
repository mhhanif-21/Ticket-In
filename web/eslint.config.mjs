import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: ["**/*.js"],
    rules: {
      // These operational smoke scripts are CommonJS entrypoints and are not
      // part of the Next.js module graph.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    rules: {
      // Existing API/storage adapters and legacy fixtures use intentionally
      // dynamic JSON payloads. Keep reporting them without failing the
      // release gate until those boundaries are migrated to shared schemas.
      "@typescript-eslint/no-explicit-any": "warn",
      // These React 19 compiler diagnostics are advisory for the current
      // client screens; the effects synchronize browser/device state.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
    },
  },
]);

export default eslintConfig;
