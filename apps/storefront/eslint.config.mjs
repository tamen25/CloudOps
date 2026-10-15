//ESLint flat config. eslint-config-next ships a Rushstack patch that's
//incompatible with ESLint 9 flat config, so the next config is intentionally
//not imported. Our rule surface stays minimal: TypeScript parsing for type
//imports and a single bug-catcher rule.
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: [".next/**", "node_modules/**", "dist/**", "*.config.mjs", "*.config.ts"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      "no-console": ["warn", { allow: ["warn", "error", "log"] }],
    },
  },
];
