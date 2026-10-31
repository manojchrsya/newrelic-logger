import { defineConfig, type OxfmtConfig } from 'oxfmt';

export default defineConfig({
  singleQuote: true,
  printWidth: 120,
  sortPackageJson: {
    sortScripts: true,
  },
  ignorePatterns: ['**/dist/**', '**/build/**', 'coverage/**', '*.min.js'],
}) as OxfmtConfig;