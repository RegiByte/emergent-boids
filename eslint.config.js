import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist", "analyzer"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "off",
        { argsIgnorePattern: "^_", args: "none" },
      ],
    },
  },
  {
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", args: "none" }],
      "react-refresh/only-export-components": "off",
      "no-explicit-any": "off",
      "@typescript-eslint/no-explicit-any": "off",
      'no-fallthrough': 'off'
    },
  },
]);
