import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { FlatCompat } = require("@eslint/eslintrc");
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".local/**",
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "coverage/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  {
    files: [
      "src/components/share.tsx",
      "src/components/shell.tsx",
      "src/components/home.tsx",
      "src/components/take-test.tsx",
    ],
    rules: { "@next/next/no-img-element": "off" },
  },
];
export default config;
