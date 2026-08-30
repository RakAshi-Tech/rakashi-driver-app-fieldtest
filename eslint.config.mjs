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
    // The Lambda is a separate CommonJS package with its own tsconfig, and is
    // already excluded from the Next.js TypeScript build. Its compiled output
    // and its Node test runner files are not Next.js app code.
    "lambda/**",
  ]),
]);

export default eslintConfig;
