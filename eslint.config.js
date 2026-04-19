import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        btoa: "readonly",
        atob: "readonly",
        NodeFilter: "readonly",
        clearTimeout: "readonly",
        setTimeout: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        Uint8Array: "readonly",
        IntersectionObserver: "readonly",
        CSS: "readonly",
        getComputedStyle: "readonly",
        navigator: "readonly",
        requestAnimationFrame: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off",
      "prefer-const": "warn",
      "no-var": "error",
    },
  },
  {
    ignores: ["node_modules", "dist", "*.config.js"],
  },
];
