import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";

// jsx-a11y rules land as `warn` (see mobile-accessibility plan Phase 1).
// Escalate individual rules to `error` as their violations are resolved.
//
// `label-has-for` is deprecated (HTML4-era rule, superseded by
// `label-has-associated-control` which is more accurate for modern React).
// Turning it off entirely so it doesn't double-count violations.
const jsxA11yWarnRules = Object.fromEntries(
  Object.keys(jsxA11y.configs.recommended.rules).map((rule) => [rule, "warn"])
);
jsxA11yWarnRules["jsx-a11y/label-has-for"] = "off";
// All autoFocus usages in this codebase are inside modals/dialogs/popovers
// where focus-on-open is the correct a11y behaviour per WCAG focus management.
// The rule is otherwise overly conservative for our context.
jsxA11yWarnRules["jsx-a11y/no-autofocus"] = "off";

/**
 * Design-system drift prevention.
 *
 * Two families of rules:
 *  - className colour/border/layout primitives (hex, rgb(a), border-dashed, min-h-screen, min-h-0).
 *  - colour literals in JSX colour-bearing props (`style`, `stroke`, `fill`, `color`, `stopColor`) —
 *    these catch hardcoded colours that bypass className entirely.
 *
 * Exemptions are SPLIT by concern rather than blanket-disabling no-restricted-syntax:
 *  - PAGE_LAYOUT_EXEMPT_FILES turn off ONLY the min-h-screen selectors (full-screen / auth pages).
 *    Colour + border-dashed rules stay ACTIVE on those pages.
 *  - COLOUR_ATTR_EXEMPT_FILES turn off ONLY the new style/stroke/fill colour-attr selectors
 *    (data-viz charts that need literal colour strings, and avatars whose colour is computed at
 *    runtime). className colour rules stay ACTIVE on those files.
 *
 * PAGE_LAYOUT_EXEMPT_FILES must stay in sync with EXEMPT_PAGES in src/design-system.test.tsx
 * (the test asserts this alignment).
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
const COLOUR_ATTR_MSG =
  "No hex/rgb(a) colour literals in style/stroke/fill/color/stopColor props. Use Tailwind tokens or hsl(var(--token)) (design-system.md § 1.2).";

// Colour-bearing JSX props beyond className: catch hardcoded colours in `style={{ ... }}`
// object literals and in string-valued SVG/chart colour props.
const COLOUR_PROP_NAMES = ["stroke", "fill", "color", "backgroundColor", "background", "stopColor"];
const colourLiteralRules = [
  // style={{ ...: "#abc" }} / style={{ ...: "rgba(...)" }}
  {
    selector: "JSXAttribute[name.name='style'] Property > Literal[value=/#[0-9a-fA-F]{3,8}\\b/]",
    message: COLOUR_ATTR_MSG,
  },
  {
    selector: "JSXAttribute[name.name='style'] Property > Literal[value=/rgba?\\s*\\(/]",
    message: COLOUR_ATTR_MSG,
  },
  {
    selector:
      "JSXAttribute[name.name='style'] Property > TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]",
    message: COLOUR_ATTR_MSG,
  },
  {
    selector:
      "JSXAttribute[name.name='style'] Property > TemplateElement[value.raw=/rgba?\\s*\\(/]",
    message: COLOUR_ATTR_MSG,
  },
  // stroke="#abc" / fill="rgba(...)" / color={`...#abc...`} etc.
  ...COLOUR_PROP_NAMES.flatMap((prop) => [
    {
      selector: `JSXAttribute[name.name='${prop}'] Literal[value=/#[0-9a-fA-F]{3,8}\\b/]`,
      message: COLOUR_ATTR_MSG,
    },
    {
      selector: `JSXAttribute[name.name='${prop}'] Literal[value=/rgba?\\s*\\(/]`,
      message: COLOUR_ATTR_MSG,
    },
    {
      selector: `JSXAttribute[name.name='${prop}'] TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]`,
      message: COLOUR_ATTR_MSG,
    },
    {
      selector: `JSXAttribute[name.name='${prop}'] TemplateElement[value.raw=/rgba?\\s*\\(/]`,
      message: COLOUR_ATTR_MSG,
    },
  ]),
];

// --- className colour / border-dashed rules (apply to all component + page files) ---
const classNameColourRules = [
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

// --- page-only layout rules ---
const minHScreenRules = [
  {
    selector: "JSXAttribute[name.name='className'] Literal[value=/(^|\\s)min-h-screen(\\s|$)/]",
    message: MIN_H_SCREEN_MSG,
  },
  {
    selector:
      "JSXAttribute[name.name='className'] TemplateElement[value.raw=/(^|\\s)min-h-screen(\\s|$)/]",
    message: MIN_H_SCREEN_MSG,
  },
];
const minH0Rules = [
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

// Full rule set for ordinary component / page files.
const componentRules = [...classNameColourRules, ...colourLiteralRules];
const pageRules = [...componentRules, ...minHScreenRules, ...minH0Rules];

// Pages exempt from the min-h-screen / min-h-0 layout constraint only (full-screen / auth
// flows). Colour + border-dashed rules stay active. Keep in sync with EXEMPT_PAGES in
// src/design-system.test.tsx.
const PAGE_LAYOUT_EXEMPT_FILES = [
  "src/pages/WelcomePage.tsx",
  "src/pages/DesignRenewPage.tsx",
  "src/pages/FullWaterfallPage.tsx",
  "src/pages/auth/LoginPage.tsx",
  "src/pages/auth/RegisterPage.tsx",
  "src/pages/auth/AcceptInvitePage.tsx",
  "src/pages/auth/ForgotPasswordPage.tsx",
  "src/pages/auth/ResetPasswordPage.tsx",
];

// Files exempt from the style/stroke/fill colour-literal rules only (className colour rules
// stay active): data-viz charts that require literal colour strings, and avatars whose
// colour is computed at runtime from the name.
const COLOUR_ATTR_EXEMPT_FILES = [
  "src/components/forecast/NetWorthChart.tsx",
  "src/components/forecast/SurplusAccumulationChart.tsx",
  "src/components/overview/TierDoughnut.tsx",
  "src/components/overview/NetWorthCard.tsx",
  "src/components/common/EntityAvatar.tsx",
  "src/components/common/PanelError.tsx",
  "src/components/ui/GhostedListEmpty.tsx",
  "src/components/settings/ActionBadge.tsx",
  "src/components/design/renew/ComponentRenewPatterns.tsx",
];

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11yWarnRules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-explicit-any": "error",
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
  // Documented full exceptions: SnapshotDot (border-dashed auto/manual distinction +
  // focus-ring rgba shadow) and CashflowYearBar (border-dashed today marker).
  {
    files: [
      "src/components/overview/SnapshotDot.tsx",
      "src/components/forecast/cashflow/CashflowYearBar.tsx",
    ],
    rules: { "no-restricted-syntax": "off" },
  },
  // Layout-exempt pages: drop ONLY the min-h-screen / min-h-0 selectors. className colour,
  // border-dashed AND the style/stroke/fill colour-literal rules stay active here.
  {
    files: PAGE_LAYOUT_EXEMPT_FILES,
    rules: {
      "no-restricted-syntax": ["error", ...componentRules],
    },
  },
  // Colour-attr-exempt files (charts / runtime-coloured avatars): drop ONLY the new
  // style/stroke/fill colour-literal selectors. className colour rules stay active.
  {
    files: COLOUR_ATTR_EXEMPT_FILES,
    rules: {
      "no-restricted-syntax": ["error", ...classNameColourRules],
    },
  },
  // Test files legitimately stub Fastify/Prisma/DOM internals with `any`.
  {
    files: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/test/**/*.ts", "src/test/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    ignores: ["dist/", "node_modules/"],
  }
);
