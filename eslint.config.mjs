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
    // Local-only scratch: a real Chrome profile lives here during smoke runs,
    // and its bundled extensions are not part of this project.
    ".chrome-profile/**",
    ".chrome-dbg/**",
    "artifacts/**",
  ]),
]);

export default eslintConfig;
