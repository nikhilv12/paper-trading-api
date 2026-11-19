const globals = require("globals");
module.exports = [{ ignores: ["node_modules/**", "data/**"] }, { files: ["**/*.js"], languageOptions: { ecmaVersion: 2022, sourceType: "commonjs", globals: { ...globals.node } }, rules: { "no-unused-vars": ["error", { argsIgnorePattern: "^_" }], "no-undef": "error" } }];
