import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default [
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
    },
  },
  {
    files: ["apps/site/src/components/Brands/*.tsx", "apps/cms/src/components/logo.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    ignores: [
      ".turbo/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "**/*.tsbuildinfo",
    ],
  },
];
