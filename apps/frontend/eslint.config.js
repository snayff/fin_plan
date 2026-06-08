import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

/**
 * Design-system drift prevention.
 *
 * Rules scope className string contents only — charts and <svg fill="#..."> are unaffected.
 * Exemption blocks turn off no-restricted-syntax entirely for a file; acceptable because the
 * exempt files are special cases (full-screen pages, documented design-anchor exceptions).
 * Source of truth: docs/2. design/design-system.md § 3.1 and CLAUDE.md.
 */
const BORDER_DASHED_MSG =
  "border-dashed is banned (design-system.md — solid borders only). Documented exceptions: SnapshotDot (auto/manual distinction), CashflowYearBar (today marker).";
const HEX_IN_CLASSNAME_MSG =
  "No hex colors in className. Use Tailwind design tokens (bg-background, text-foreground, tier-*, page-accent).";
const RGBA_IN_CLASSNAME_MSG =
  "No rgb/rgba in className. Use Tailwind token with opacity modifier (e.g. text-foreground/60) or bg-surface-overlay.";
const MIN_H_SCREEN_MSG =
  "Pages must use h-full, not min-h-screen (design-system.md § 3.1 — height-constraint chain).";
const MIN_H_0_MSG =
  "flex-1 overflow-y-auto on a page-level container must include min-h-0 or the scrollbar will not activate (design-system.md § 3.1).";

const componentRules = [
  {
    selector: "JSXAttribute[name.name='className'] Literal[value=/(^|\\s)border-dashed(\\s|$)/]",
    message: BORDER_DASHED_MSG,
  },
  {
    selector:
      "JSXAttribute[name.name='className'] TemplateElement[value.raw=/(^|\\s)border-dashed(\\s|$)/]",
    message: BORDER_DASHED_MSG,
  },
  {
    selector: "JSXAttribute[name.name='className'] Literal[value=/#[0-9a-fA-F]{3,8}\\b/]",
    message: HEX_IN_CLASSNAME_MSG,
  },
  {
    selector:
      "JSXAttribute[name.name='className'] TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]",
    message: HEX_IN_CLASSNAME_MSG,
  },
  {
    selector: "JSXAttribute[name.name='className'] Literal[value=/rgba?\\s*\\(/]",
    message: RGBA_IN_CLASSNAME_MSG,
  },
  {
    selector: "JSXAttribute[name.name='className'] TemplateElement[value.raw=/rgba?\\s*\\(/]",
    message: RGBA_IN_CLASSNAME_MSG,
  },
];

const pageRules = [
  ...componentRules,
  {
    selector: "JSXAttribute[name.name='className'] Literal[value=/(^|\\s)min-h-screen(\\s|$)/]",
    message: MIN_H_SCREEN_MSG,
  },
  {
    selector:
      "JSXAttribute[name.name='className'] TemplateElement[value.raw=/(^|\\s)min-h-screen(\\s|$)/]",
    message: MIN_H_SCREEN_MSG,
  },
  {
    selector:
      "JSXAttribute[name.name='className'] Literal[value=/\\bflex-1\\b/][value=/\\boverflow-y-auto\\b/][value!=/\\bmin-h-0\\b/]",
    message: MIN_H_0_MSG,
  },
  {
    selector:
      "JSXAttribute[name.name='className'] TemplateElement[value.raw=/\\bflex-1\\b/][value.raw=/\\boverflow-y-auto\\b/][value.raw!=/\\bmin-h-0\\b/]",
    message: MIN_H_0_MSG,
  },
];

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": ["error", ...componentRules],
    },
  },
  {
    files: ["src/pages/**/*.tsx"],
    rules: {
      "no-restricted-syntax": ["error", ...pageRules],
    },
  },
  {
    files: [
      "src/components/overview/SnapshotDot.tsx",
      "src/components/forecast/cashflow/CashflowYearBar.tsx",
    ],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    files: [
      "src/pages/WelcomePage.tsx",
      "src/pages/DesignRenewPage.tsx",
      "src/pages/auth/LoginPage.tsx",
      "src/pages/auth/RegisterPage.tsx",
      "src/pages/auth/AcceptInvitePage.tsx",
    ],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    ignores: ["dist/", "node_modules/"],
  }
);
