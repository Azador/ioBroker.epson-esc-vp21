// eslint.config.js
const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
    {
        ignores: ["node_modules/", ".dev-server/", "admin/words.js"],
    },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: {
                ...globals.node,
                ...globals.mocha,
            },
        },
        rules: {
            "indent": ["error", 4, { "SwitchCase": 1 }],
            "no-console": "off",
            "no-var": "error",
            "no-trailing-spaces": "error",
            "prefer-const": "error",
            "eqeqeq": ["error", "always"],
            "quotes": ["error", "double", { "avoidEscape": true, "allowTemplateLiterals": true }],
            "semi": ["error", "always"],
        },
    },
];
