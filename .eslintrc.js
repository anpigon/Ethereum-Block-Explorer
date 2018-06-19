export default {
  "env": {
    "browser": false,
    "es6": true,
  },
  "extends": "eslint:recommended",
  "parserOptions": {
    "esversion": 6,
    "sourceType": "module"
  },
  "rules": {
    "indent": [
      "error",
      "space"
    ],
    "linebreak-style": [
      "error",
      "windows"
    ],
    "quotes": [
      "error",
      "double"
    ],
    "semi": [
      "error",
      "always"
    ]
  }
};