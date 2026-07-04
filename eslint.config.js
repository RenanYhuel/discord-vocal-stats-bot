const globals = require("globals");

module.exports = [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: require("@typescript-eslint/parser"),
      parserOptions: {
        project: "./tsconfig.json"
      },
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    },
    plugins: {
      "@typescript-eslint": require("@typescript-eslint/eslint-plugin")
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "no-undef": "off",
      "eqeqeq": ["error", "always"],
      "curly": ["error", "all"],
      "semi": ["error", "always"],
      "quotes": ["error", "double", { "avoidEscape": true }]
    }
  }
];
