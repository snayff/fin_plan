/**
 * Design-system drift prevention — structural invariants across pages.
 *
 * Source of truth: docs/2. design/design-system.md § 3.1 and CLAUDE.md "Panel Layout".
 * Complements the ESLint rules in eslint.config.js — lint covers className primitives,
 * this file covers composition invariants (PageHeader presence, wrapper delegation,
 * right-panel add-button pattern) that AST selectors can't express reliably.
 *
 * Matching is token-order-insensitive: every className string is tokenised and compared
 * as a set, so `flex flex-col h-full` and `flex h-full flex-col` are treated identically.
 */
import { describe, it, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";

const SRC_DIR = import.meta.dir;
const PAGES_DIR = join(SRC_DIR, "pages");
const COMPONENTS_DIR = join(SRC_DIR, "components");

/**
 * Pages exempt from the inline left-panel scroll-anatomy checks (full-screen / auth flows
 * that legitimately sit outside the TwoPanelLayout chassis).
 *
 * IMPORTANT: keep this list in sync with the `min-h-screen`-exempt page list in
 * eslint.config.js (asserted below). Colour rules (hex/rgba/border-dashed) stay ACTIVE on
 * these pages in lint — exemption here is purely for the structural left-panel asserts.
 */
const EXEMPT_PAGES = new Set<string>([
  "WelcomePage.tsx",
  "DesignRenewPage.tsx",
  "FullWaterfallPage.tsx",
  "auth/LoginPage.tsx",
  "auth/RegisterPage.tsx",
  "auth/AcceptInvitePage.tsx",
  "auth/ForgotPasswordPage.tsx",
  "auth/ResetPasswordPage.tsx",
]);

function normalise(p: string): string {
  return p.replace(/\\/g, "/");
}

function discoverPages(): string[] {
  const glob = new Glob("**/*Page.tsx");
  return Array.from(glob.scanSync(PAGES_DIR))
    .map(normalise)
    .filter((f) => !f.endsWith(".test.tsx"))
    .sort();
}

const allPages = discoverPages();
const nonExemptPages = allPages.filter((f) => !EXEMPT_PAGES.has(f));

function readPage(relPath: string): string {
  return readFileSync(join(PAGES_DIR, relPath), "utf8");
}

function readComponent(relPath: string): string {
  return readFileSync(join(COMPONENTS_DIR, relPath), "utf8");
}

/**
 * Extract every className string value from a source file, covering double-quoted,
 * single-quoted, and template-literal forms (template expressions are stripped so the
 * static class fragments around them are still tokenisable).
 */
function extractClassNameValues(source: string): string[] {
  const values: string[] = [];
  // className="..." | className='...' | className={"..."} | className={'...'} | className={`...`}
  const re = /className=\{?\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const raw = m[1] ?? m[2] ?? m[3] ?? "";
    // Drop template-literal interpolations so the static fragments remain matchable.
    values.push(raw.replace(/\$\{[^}]*\}/g, " "));
  }
  return values;
}

function tokenSet(value: string): Set<string> {
  return new Set(value.split(/\s+/).filter(Boolean));
}

/** True if any single className value in the source contains ALL the required tokens. */
function hasClassNameWithAll(source: string, required: string[]): boolean {
  return extractClassNameValues(source).some((value) => {
    const tokens = tokenSet(value);
    return required.every((t) => tokens.has(t));
  });
}

/** Index of the className value (in source) that contains all required tokens, or -1. */
function indexOfClassNameWithAll(source: string, required: string[]): number {
  const re = /className=\{?\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, " ");
    const tokens = tokenSet(raw);
    if (required.every((t) => tokens.has(t))) return m.index;
  }
  return -1;
}

// Broadened regexes: match the banned token inside double-quoted, single-quoted, and
// template-literal className strings (the old version only checked double quotes).
const MIN_H_SCREEN_RE = /className=\{?\s*(?:"|'|`)[^"'`]*\bmin-h-screen\b/;
const BORDER_DASHED_RE = /className=\{?\s*(?:"|'|`)[^"'`]*\bborder-dashed\b/;

const LEFT_WRAPPER_CLASSES = ["flex", "flex-col", "h-full"];
const SCROLL_REGION_CLASSES = ["flex-1", "overflow-y-auto"];

/**
 * Resolve the source of any delegated left-panel component a page references.
 * A page either defines its left panel inline, or passes `left={<XxxLeftPanel .../>}` /
 * `left={<XxxLeftAside .../>}`. We follow those references (by component basename, resolved
 * against the components tree) so their scroll anatomy is validated too.
 */
function componentPathByBasename(basename: string): string | null {
  const glob = new Glob(`**/${basename}.tsx`);
  const hits = Array.from(glob.scanSync(COMPONENTS_DIR)).map(normalise);
  return hits.length === 1 ? join(COMPONENTS_DIR, hits[0]!) : null;
}

function delegatedLeftPanelSources(pageSource: string): string[] {
  // Identifiers ending in LeftPanel / LeftAside that are actually rendered as JSX.
  const refs = new Set<string>();
  const re = /<([A-Z][A-Za-z0-9]*(?:LeftPanel|LeftAside))\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pageSource)) !== null) refs.add(m[1]!);
  const sources: string[] = [];
  for (const ref of refs) {
    const path = componentPathByBasename(ref);
    if (path && existsSync(path)) sources.push(readFileSync(path, "utf8"));
  }
  return sources;
}

/**
 * A page satisfies the left-panel scroll anatomy if the wrapper + scroll region appear
 * either in the page itself or in a delegated left-panel component it renders.
 */
function leftPanelSourcesFor(relPath: string): { label: string; source: string }[] {
  const pageSource = readPage(relPath);
  const sources = [{ label: relPath, source: pageSource }];
  for (const [i, s] of delegatedLeftPanelSources(pageSource).entries()) {
    sources.push({ label: `${relPath} → delegated[${i}]`, source: s });
  }
  return sources;
}

describe("design system — page invariants", () => {
  it("discovered at least 5 non-exempt pages (sanity check)", () => {
    expect(nonExemptPages.length).toBeGreaterThanOrEqual(5);
  });

  it("EXEMPT_PAGES stays in sync with PAGE_LAYOUT_EXEMPT_FILES in eslint.config.js", () => {
    const eslintConfig = readFileSync(join(SRC_DIR, "..", "eslint.config.js"), "utf8");
    const block = eslintConfig.match(/const PAGE_LAYOUT_EXEMPT_FILES\s*=\s*\[([\s\S]*?)\]/);
    expect(block).not.toBeNull();
    const eslintPages = Array.from(block![1]!.matchAll(/"src\/pages\/([^"]+)"/g))
      .map((m) => m[1]!)
      .sort();
    expect(eslintPages).toEqual(Array.from(EXEMPT_PAGES).sort());
  });

  for (const relPath of nonExemptPages) {
    describe(relPath, () => {
      const source = readPage(relPath);
      const isTierWrapper = /<TierPage\b/.test(source);
      const isSettingsWrapper =
        /<SettingsLeftPanel\b/.test(source) || /<SettingsRightPanel\b/.test(source);

      it("does not use min-h-screen", () => {
        expect(source).not.toMatch(MIN_H_SCREEN_RE);
      });

      it("uses TwoPanelLayout directly or via TierPage / Settings wrappers", () => {
        const direct = /\bTwoPanelLayout\b/.test(source);
        expect(direct || isTierWrapper || isSettingsWrapper).toBe(true);
      });

      it("does not use border-dashed", () => {
        expect(source).not.toMatch(BORDER_DASHED_RE);
      });

      // TierPage / Settings wrappers delegate their scroll anatomy to shared components
      // (TierPage internals, SettingsLeftPanel) that are validated by their own tests.
      if (!isTierWrapper && !isSettingsWrapper) {
        const candidates = leftPanelSourcesFor(relPath);
        // The left-panel anatomy holder is the source that contains both the flex-col
        // wrapper AND a PageHeader (left-panel headers must use PageHeader). Requiring
        // PageHeader avoids matching a page whose only flex-col wrapper belongs to its
        // *right* panel — in that case the real left panel is a delegated component and
        // its source (which has the PageHeader) is selected instead. Pages whose layout
        // is fully driven by a non-Left* wrapper component are skipped (no holder).
        const wrapperHolder = candidates.find(
          (c) =>
            hasClassNameWithAll(c.source, LEFT_WRAPPER_CLASSES) && /<PageHeader\b/.test(c.source)
        );

        if (wrapperHolder) {
          it("left panel: includes PageHeader and a flex-1 overflow-y-auto scroll region", () => {
            // PageHeader + scroll region must live in the same source as the wrapper.
            expect(wrapperHolder.source).toMatch(/<PageHeader\b/);
            expect(hasClassNameWithAll(wrapperHolder.source, SCROLL_REGION_CLASSES)).toBe(true);
          });

          it("left panel: scroll region includes min-h-0 for scroll containment", () => {
            expect(
              hasClassNameWithAll(wrapperHolder.source, [...SCROLL_REGION_CLASSES, "min-h-0"])
            ).toBe(true);
          });

          it("left panel: PageHeader appears before the scroll region", () => {
            const headerIdx = wrapperHolder.source.search(/<PageHeader\b/);
            const scrollIdx = indexOfClassNameWithAll(wrapperHolder.source, SCROLL_REGION_CLASSES);
            expect(headerIdx).toBeGreaterThanOrEqual(0);
            expect(scrollIdx).toBeGreaterThan(headerIdx);
          });
        }
      }
    });
  }
});

/**
 * Right-panel "add" affordances must use GhostAddButton. The curated container list is
 * derived by glob rather than hardcoded, so a new *ItemArea / *Panel container with an
 * add affordance is automatically held to the rule.
 */
function discoverRightPanelContainers(): string[] {
  const patterns = ["**/*ItemArea.tsx", "**/*Panel.tsx"];
  const found = new Set<string>();
  for (const pattern of patterns) {
    const glob = new Glob(pattern);
    for (const f of glob.scanSync(COMPONENTS_DIR)) {
      const rel = normalise(f);
      if (rel.endsWith(".test.tsx")) continue;
      found.add(rel);
    }
  }
  return Array.from(found).sort();
}

const ADD_AFFORDANCE_RE =
  /\binitialIsAdding\b|\bonAddClick\b|\bsetIsAddingItem\b|\bsetIsAdding\b|\bisAddingItem\b/;

describe("design system — right-panel add buttons use GhostAddButton", () => {
  const containers = discoverRightPanelContainers();

  it("discovered right-panel containers (sanity check)", () => {
    expect(containers.length).toBeGreaterThanOrEqual(3);
  });

  for (const relPath of containers) {
    const source = readComponent(relPath);
    if (!ADD_AFFORDANCE_RE.test(source)) continue;
    it(`${relPath}: header add-affordance uses GhostAddButton`, () => {
      expect(source).toMatch(/\bGhostAddButton\b/);
    });
  }
});
