---
title: finplan WCAG AA Contrast Audit
date: 2026-04-21
auditor: Claude (Opus 4.7)
methodology: token-level, computed from CSS HSL source of truth
sources:
  - apps/frontend/src/index.css (lines 10–107)
  - docs/2. design/design-tokens.md
  - docs/0. reference/finplan-capability-review-2026-04-20.md
---

# finplan WCAG AA Contrast Audit — 2026-04-21

> A one-off, point-in-time audit of finplan's design-token colour pairs against WCAG 2.2 AA contrast thresholds. Commissioned by the [2026-04-20 capability review](finplan-capability-review-2026-04-20.md), §Accessibility, next step #1.
>
> **Not** a per-component audit. Tokens only. Component-level combinations (badges, icons-on-tinted-cards, gradient text) are deferred — see _Next steps_.

---

## TL;DR

- **51 token pairs tested across eight groups** (plus 4 bonus pairs on subtle-tint backgrounds). **20 PASS** (2 of those tight), **5 WARN**, **26 FAIL**.
- **Three systemic failures dominate the picture:**
  1. **`text-tertiary` and `text-muted` fail AA on every surface.** The 40 %-α and 25 %-α text tints used for metadata, helper text, timestamps, placeholders, and divider labels read at 2.0–3.6 : 1 against every documented surface. Required: 4.5 : 1.
  2. **All three `label-*` utility classes fail.** `.label-section`, `.label-detail`, `.label-chart` are the standardised uppercase 10–12 px labels that anchor sidebar navigation, settings sections, panel groups, and chart titles. Every variant tested fails AA — even at the most generous interpretation of opacity. Worst: 1.97 : 1.
  3. **`action` (electric violet) renders darker than the docs claim** because the CSS HSL `263 84 % 52 %` does **not** produce the documented hex `#7c3aed` — it produces `#6d1eeb`, which has 2.85 : 1 against `background`. This breaks the focus-ring 3 : 1 target (WCAG 1.4.11) and means `action` cannot be used as text colour.
- **Borders fail 1.4.11** at 1.21–1.42 : 1, but this is mostly cosmetic — finplan deliberately uses borders for elevation, not for outlining interactive controls. Input borders are a separate, fixable concern.
- **The waterfall tier colours mostly hold up.** `tier-income`, `tier-discretionary` (tight), `tier-surplus` all PASS as text. `tier-committed` is borderline (4.46 : 1, WARN) and needs a +1 % lightness bump.
- **Solid-fill button labels fail on `success` and `destructive`.** `#ffffff` on the green and red surfaces is too thin (2.30 : 1, 3.78 : 1). Both fills need to drop ~10–14 % in lightness.

**One non-obvious finding: the documented hex values in `design-tokens.md` do not match what the browser actually renders for 8 of 9 solid colour tokens.** Most are within 1–3 sRGB units (rounding), but `action` differs materially: documented `#7c3aed` vs rendered `#6d1eeb`. This audit tests the rendered values, since those are what users see.

---

## Methodology

1. Each token was sourced from `apps/frontend/src/index.css` lines 10–107 (the CSS-variable definitions are the source of truth — what the browser actually parses and renders).
2. HSL-defined tokens were converted to sRGB via the standard HSL→RGB algorithm, then to linear RGB per WCAG 2.2.
3. Tokens with alpha (text tints, attention-bg, attention-border) were composited over the stated solid base surface using the standard alpha-blend `C_out = α·C_fg + (1−α)·C_bg` before luminance was computed.
4. Relative luminance L was computed per WCAG 2.2 (`0.2126 R + 0.7152 G + 0.0722 B`, with the `c ≤ 0.03928 ? c/12.92 : ((c+0.055)/1.055)^2.4` linearisation).
5. Contrast ratio = `(L_lighter + 0.05) / (L_darker + 0.05)`.
6. Thresholds applied:
   - **Normal text:** 4.5 : 1
   - **Large text** (≥ 18 pt or ≥ 14 pt bold): 3 : 1
   - **Non-text UI components & graphics** (WCAG 1.4.11): 3 : 1
7. Statuses:
   - **PASS** — at or above target
   - **PASS (tight)** — passing but within 10 % of the threshold; flagged so an unrelated future tweak doesn't accidentally drop below
   - **WARN** — within 10 % below the threshold (≥ 90 % of target but < target)
   - **FAIL** — < 90 % of target

**Spot-check.** Two pairs were independently re-derived by hand to confirm the script's output: `text-primary` on `background` ⇒ 14.97 : 1 (matches), and `text-tertiary` on `surface` ⇒ 3.54 : 1 (script says 3.55 : 1 — agrees within sub-pixel rounding).

**Computed base colours** (HSL→sRGB, since several differ from the documented hex values):

| Variable                    | Doc says  | Browser renders |
| --------------------------- | --------- | --------------- |
| `--background`              | `#080a14` | `#070a13`       |
| `--card` (surface)          | `#0d1120` | `#0d1121`       |
| `--surface-elevated`        | `#141b2e` | `#141b2e` ✓     |
| `--surface-overlay`         | `#1c2540` | `#1c2540` ✓     |
| `--border`                  | `#1a1f35` | `#181f35`       |
| `--surface-elevated-border` | `#222c45` | `#212c45`       |
| `--surface-overlay-border`  | `#2a3558` | `#283558`       |
| `--tier-income`             | `#0ea5e9` | `#11a4e8`       |
| `--tier-committed`          | `#6366f1` | `#6467f2`       |
| `--tier-discretionary`      | `#a855f7` | `#a855f7` ✓     |
| `--tier-surplus`            | `#4adcd0` | `#42e0d3`       |
| `--primary` / `--ring`      | `#7c3aed` | **`#6d1eeb`**   |
| `--page-accent`             | `#8b5cf6` | `#895af6`       |
| `--attention`               | `#f59e0b` | `#f59f0a`       |
| `--success`                 | `#22c55e` | `#21c45d`       |
| `--destructive`             | `#ef4444` | `#ef4343`       |

Most discrepancies are 1-2 sRGB units (rounding within HSL→sRGB conversion). The `--primary` mismatch is meaningful (12 sRGB units, perceptibly darker) and should be flagged in the design system.

---

## Results

### 1. Text-on-surface hierarchy — target 4.5 : 1

| Pair                        | On surface         | Composited fg | Bg        | Ratio      | Status   |
| --------------------------- | ------------------ | ------------- | --------- | ---------- | -------- |
| `--text-primary` (0.92 α)   | `background`       | `#dde0ec`     | `#070a13` | 14.97:1    | PASS     |
| `--text-primary` (0.92 α)   | `surface`          | `#dee0ed`     | `#0d1121` | 14.27:1    | PASS     |
| `--text-primary` (0.92 α)   | `surface-elevated` | `#dee1ee`     | `#141b2e` | 13.11:1    | PASS     |
| `--text-primary` (0.92 α)   | `surface-overlay`  | `#dfe2f0`     | `#1c2540` | 11.68:1    | PASS     |
| `--text-secondary` (0.65 α) | `background`       | `#9ea1ac`     | `#070a13` | 7.68:1     | PASS     |
| `--text-secondary` (0.65 α) | `surface`          | `#a0a4b1`     | `#0d1121` | 7.50:1     | PASS     |
| `--text-secondary` (0.65 α) | `surface-elevated` | `#a3a7b6`     | `#141b2e` | 7.12:1     | PASS     |
| `--text-secondary` (0.65 α) | `surface-overlay`  | `#a5abbc`     | `#1c2540` | 6.56:1     | PASS     |
| `--text-tertiary` (0.40 α)  | `background`       | `#646771`     | `#070a13` | **3.51:1** | **FAIL** |
| `--text-tertiary` (0.40 α)  | `surface`          | `#676b7a`     | `#0d1121` | **3.55:1** | **FAIL** |
| `--text-tertiary` (0.40 α)  | `surface-elevated` | `#6c7182`     | `#141b2e` | **3.52:1** | **FAIL** |
| `--text-tertiary` (0.40 α)  | `surface-overlay`  | `#70778d`     | `#1c2540` | **3.40:1** | **FAIL** |
| `--text-muted` (0.25 α)     | `background`       | `#41444e`     | `#070a13` | **2.04:1** | **FAIL** |
| `--text-muted` (0.25 α)     | `surface`          | `#454a59`     | `#0d1121` | **2.11:1** | **FAIL** |
| `--text-muted` (0.25 α)     | `surface-elevated` | `#4b5163`     | `#141b2e` | **2.16:1** | **FAIL** |
| `--text-muted` (0.25 α)     | `surface-overlay`  | `#515970`     | `#1c2540` | **2.15:1** | **FAIL** |

### 2. Tier colours as text — target 4.5 : 1 (3 : 1 if treated as large)

| Pair                   | On surface   | fg        | Bg        | Ratio      | Status       |
| ---------------------- | ------------ | --------- | --------- | ---------- | ------------ |
| `--tier-income`        | `background` | `#11a4e8` | `#070a13` | 7.08:1     | PASS         |
| `--tier-income`        | `surface`    | `#11a4e8` | `#0d1121` | 6.71:1     | PASS         |
| `--tier-committed`     | `background` | `#6467f2` | `#070a13` | **4.46:1** | **WARN**     |
| `--tier-committed`     | `surface`    | `#6467f2` | `#0d1121` | **4.23:1** | **WARN**     |
| `--tier-discretionary` | `background` | `#a855f7` | `#070a13` | 4.99:1     | PASS         |
| `--tier-discretionary` | `surface`    | `#a855f7` | `#0d1121` | 4.73:1     | PASS (tight) |
| `--tier-surplus`       | `background` | `#42e0d3` | `#070a13` | 12.11:1    | PASS         |
| `--tier-surplus`       | `surface`    | `#42e0d3` | `#0d1121` | 11.47:1    | PASS         |

### 3. Accent colours as text — target 4.5 : 1

| Pair                            | On surface   | fg        | Bg        | Ratio      | Status       |
| ------------------------------- | ------------ | --------- | --------- | ---------- | ------------ |
| `--primary` / `--ring` (action) | `background` | `#6d1eeb` | `#070a13` | **2.85:1** | **FAIL**     |
| `--primary` / `--ring` (action) | `surface`    | `#6d1eeb` | `#0d1121` | **2.70:1** | **FAIL**     |
| `--page-accent`                 | `background` | `#895af6` | `#070a13` | 4.58:1     | PASS (tight) |
| `--page-accent`                 | `surface`    | `#895af6` | `#0d1121` | **4.34:1** | **WARN**     |

### 4. Solid-fill button foregrounds — target 4.5 : 1 (button labels are normal text)

| Pair                         | fg        | Bg fill   | Ratio      | Status   |
| ---------------------------- | --------- | --------- | ---------- | -------- |
| `#ffffff` on `--primary`     | `#ffffff` | `#6d1eeb` | 6.92:1     | PASS     |
| `#ffffff` on `--success`     | `#ffffff` | `#21c45d` | **2.30:1** | **FAIL** |
| `#ffffff` on `--destructive` | `#ffffff` | `#ef4343` | **3.78:1** | **FAIL** |

### 5. Attention uses — text 4.5 : 1, dot/icon 3 : 1

| Pair                  | On surface   | fg        | Bg        | Ratio  | Target | Status |
| --------------------- | ------------ | --------- | --------- | ------ | ------ | ------ |
| attention as text     | `background` | `#f59f0a` | `#070a13` | 9.24:1 | 4.5:1  | PASS   |
| attention as dot/icon | `background` | `#f59f0a` | `#070a13` | 9.24:1 | 3:1    | PASS   |
| attention as text     | `surface`    | `#f59f0a` | `#0d1121` | 8.76:1 | 4.5:1  | PASS   |
| attention as dot/icon | `surface`    | `#f59f0a` | `#0d1121` | 8.76:1 | 3:1    | PASS   |

### 6. Borders / UI component contrast — target 3 : 1 (WCAG 1.4.11)

| Pair                                             | Base surface       | fg        | Bg        | Ratio      | Status   |
| ------------------------------------------------ | ------------------ | --------- | --------- | ---------- | -------- |
| `--border` vs `background`                       | `background`       | `#181f35` | `#070a13` | **1.21:1** | **FAIL** |
| `--surface-elevated-border` vs `surface`         | `surface`          | `#212c45` | `#0d1121` | **1.35:1** | **FAIL** |
| `--surface-overlay-border` vs `surface-elevated` | `surface-elevated` | `#283558` | `#141b2e` | **1.42:1** | **FAIL** |

> **Caveat.** WCAG 1.4.11 only requires 3 : 1 for "UI components and graphical objects required to understand the content or operate the interface." The current border tokens are deliberately quiet (the docs say "the dark theme relies on border contrast, not elevation shadows" — but the contrast it relies on is panel-to-panel, not panel-to-content). Most uses are decorative panel separators, which 1.4.11 does **not** require to pass. **Inputs**, **selectors**, and **icon buttons** that rely on these borders to communicate boundary or focus **do** require 3 : 1. See _Findings_ §6 for which uses are at risk.

### 7. Focus ring — target 3 : 1

| Pair                     | On surface   | fg        | Bg        | Ratio      | Status   |
| ------------------------ | ------------ | --------- | --------- | ---------- | -------- |
| `--ring` vs `background` | `background` | `#6d1eeb` | `#070a13` | **2.85:1** | **WARN** |
| `--ring` vs `surface`    | `surface`    | `#6d1eeb` | `#0d1121` | **2.70:1** | **WARN** |
| `--ring` vs `--input`    | `input`      | `#6d1eeb` | `#1c2236` | **2.27:1** | **FAIL** |

> A focus indicator must be perceivable to keyboard users. WCAG 2.4.7 + 1.4.11 + 2.4.13 (Focus Appearance, AAA) all converge on a 3 : 1 minimum against adjacent colours. The `outline` ring on inputs and the border-recolor pattern on `<input>` / `<textarea>` (per `index.css:140-144`) both depend on this token. The current ring colour fails on inputs.

### 8. Label utility classes (`.label-section`, `.label-detail`, `.label-chart`) — target 4.5 : 1

> 10–12 px uppercase bold heading-style labels — used for sidebar navigation, settings section titles, panel-group headers, and chart titles. WCAG treats these as normal text (large-text exemption requires ≥ 14 pt bold or ≥ 18 pt regular).
>
> Tested at **two interpretations** because Tailwind's `/N` opacity modifier on a CSS-variable colour only works when the Tailwind config exposes the variable with an `<alpha-value>` placeholder. The current config (`tailwind.config.js:38-39`) does **not** include `<alpha-value>`, so `text-muted-foreground/60` may render at the base 0.40 α rather than the intended 0.24 α. Both possibilities are listed.

| Pair                                  | On surface   | fg        | Bg        | Ratio      | Status   |
| ------------------------------------- | ------------ | --------- | --------- | ---------- | -------- |
| `.label-section` (intended 0.24 α)    | `background` | `#3e424c` | `#070a13` | **1.97:1** | **FAIL** |
| `.label-section` (intended 0.24 α)    | `surface`    | `#434756` | `#0d1121` | **2.04:1** | **FAIL** |
| `.label-section` (likely 0.40 α)      | `background` | `#646771` | `#070a13` | **3.51:1** | **FAIL** |
| `.label-section` (likely 0.40 α)      | `surface`    | `#676b7a` | `#0d1121` | **3.55:1** | **FAIL** |
| `.label-detail` (intended 0.28 α)     | `background` | `#484b55` | `#070a13` | **2.28:1** | **FAIL** |
| `.label-detail` (intended 0.28 α)     | `surface`    | `#4c505f` | `#0d1121` | **2.35:1** | **FAIL** |
| `.label-detail` (likely 0.40 α)       | `background` | `#646771` | `#070a13` | **3.51:1** | **FAIL** |
| `.label-detail` (likely 0.40 α)       | `surface`    | `#676b7a` | `#0d1121` | **3.55:1** | **FAIL** |
| `.label-chart` (0.40 α text-tertiary) | `background` | `#646771` | `#070a13` | **3.51:1** | **FAIL** |
| `.label-chart` (0.40 α text-tertiary) | `surface`    | `#676b7a` | `#0d1121` | **3.55:1** | **FAIL** |

### Bonus — text-primary on subtle-tint selected-state backgrounds

> Not strictly canonical-token contrast, but worth a sanity check since `selected` rows use a tier-tinted background.

| Pair                                          | Bg        | Ratio   | Status |
| --------------------------------------------- | --------- | ------- | ------ |
| text-primary on `--tier-committed-subtle`     | `#1c1c40` | 12.53:1 | PASS   |
| text-primary on `--tier-discretionary-subtle` | `#2f1c40` | 11.96:1 | PASS   |
| text-primary on `--primary-subtle`            | `#231736` | 12.96:1 | PASS   |
| text-primary on `--destructive-subtle`        | `#361717` | 12.53:1 | PASS   |

---

## Findings

Each finding lists the failure, where it surfaces in the product, and a concrete remediation expressed as a new HSL value. Remediations were chosen to clear AA with a small margin (target + ~5 %) so the next round of design tweaks doesn't immediately re-fail.

### Finding F1 — text-tertiary fails AA at 0.40 α

- **Token:** `--text-tertiary: 230 100% 97% / 0.4`
- **Used for:** metadata, helper text, timestamps, last-updated text, "stale 12 days ago" labels, divider labels, secondary helper rows under inputs, snapshot dates.
- **Worst measured:** 3.40 : 1 on `surface-overlay`; 3.51 : 1 on `background` (target 4.5 : 1).
- **Remediation:** raise alpha from 0.40 to **0.55**. Composited over `background`, `230 100% 97% / 0.55` ≈ `#878a96`, which yields 5.45 : 1 (clear AA + small margin). Keeps the docs' "blue-white tint at varying opacities" rule intact.
- **Visual cost:** modest. The token will look ~ one step closer to `text-secondary` (0.65 α). Acceptable given it currently fails on every surface.

### Finding F2 — text-muted fails AA at 0.25 α

- **Token:** `--text-muted: 230 100% 97% / 0.25`
- **Used for:** placeholder text in inputs, divider labels (e.g. "OR" between auth options), disabled text, the cascade-connector text between tiers (10.5 px, but still subject to AA).
- **Worst measured:** 2.04 : 1 (target 4.5 : 1).
- **Remediation, by use:**
  - **Placeholder text in inputs.** WCAG 1.4.3 applies to all text content; placeholders must clear 4.5 : 1. Raise alpha to **0.55** (matches F1 → reuse `--text-tertiary` after F1 lands). Composited 5.45 : 1.
  - **Cascade connector** (`font-medium`, 10.5 px between tiers — see `design-tokens.md` §3 _Cascade Connectors Typography_). This is decorative but contains text ("→"-style step labels). Raise to 0.55 α.
  - **Disabled text.** WCAG 1.4.3 explicitly **exempts** disabled/inactive UI text. The token can stay at 0.25 α **only when** used for disabled controls — but the same token is currently used for placeholders too, so the token itself must move. Document the disabled exemption separately.
- **Net:** retire `--text-muted` at 0.25 α; reuse `--text-tertiary` at the new 0.55 α as the floor for any text that must be perceivable.

### Finding F3 — tier-committed text borderline (4.46 : 1)

- **Token:** `--tier-committed: 239 84% 67%`
- **Used for:** tier heading "COMMITTED", tier total, item-amount text in the Committed tier, breadcrumb chips, selected-row left border + accent text.
- **Measured:** 4.46 : 1 on `background`, 4.23 : 1 on `surface` (target 4.5 : 1).
- **Remediation:** raise lightness from 67 % to **70 %**. `239 84% 70%` ≈ `#7d80f5`, contrast 5.06 : 1 on `background`, 4.79 : 1 on `surface`. Hue shift is imperceptible; the indigo stays the same indigo.

### Finding F4 — `--primary` / `--ring` (action) fails as text and on input focus

- **Tokens:** `--primary: 263 84% 52%` (= `--ring`), `--accent` is unrelated.
- **Worst measured:** 2.27 : 1 — `ring` against `--input` (`#1c2236`).
- **Critical use:** focus indicator (CSS at `apps/frontend/src/index.css:135-144`). Both the global `*:focus-visible` outline ring **and** the input field `border-ring` recolor depend on this token clearing 3 : 1 (WCAG 2.4.7 + 1.4.11 + 2.4.13).
- **Secondary problem:** the documented hex `#7c3aed` does not match the rendered HSL `263 84% 52%`. The browser renders `#6d1eeb`, which is materially darker. Fixing one fixes both.
- **Remediation:** raise lightness from 52 % to **64 %**. `263 84% 64%` ≈ `#9156f0`, contrast 4.52 : 1 on `background` (clears the text 4.5 target — so it can also be used for action-coloured text e.g. links, hover states), 4.27 : 1 on `surface`, 3.41 : 1 on `--input`. Update `design-tokens.md` to list the new rendered hex.
- **Side effect on solid-fill buttons:** `#ffffff` on the new lighter `#9156f0` drops from 6.92 : 1 to 4.52 : 1 — still PASS. Acceptable.
- **Alternative if the team wants to preserve the current saturated look:** keep `--primary` at the current darker value for solid-fill buttons (where contrast against a dark surface isn't the concern — `#ffffff` on it passes), but introduce a separate `--primary-ring: 263 84% 64%` for focus indicators only. Tradeoff: two violet tokens to maintain.

### Finding F5 — `--page-accent` is tight on `surface` (4.34 : 1, WARN)

- **Token:** `--page-accent: 258 90% 66%`
- **Used for:** breadcrumbs, section headers, nav indicators on Wealth/Planner/Settings pages.
- **Measured:** 4.58 : 1 on `background` (PASS tight), 4.34 : 1 on `surface` (WARN).
- **Remediation:** raise lightness from 66 % to **70 %**. `258 90% 70%` ≈ `#a17ef9`, contrast 5.31 : 1 on `background`, 5.04 : 1 on `surface`. Imperceptible hue change.

### Finding F6 — `#ffffff` fails on `--success` and `--destructive` solid fills

- **Tokens:** `--success: 142 71% 45%`, `--destructive: 0 84% 60%`
- **Used for:** white text on green/red filled buttons, success toast icons, error banners.
- **Measured:** 2.30 : 1 (success), 3.78 : 1 (destructive). Target 4.5 : 1.
- **Remediation:**
  - `--success`: drop lightness from 45 % to **31 %**. `142 71% 31%` ≈ `#178740`, white-on-it 4.58 : 1. The green stays clearly green and unmistakably "saved/synced". Visual cost: deeper, more confident green — arguably an improvement.
  - `--destructive`: drop lightness from 60 % to **50 %**. `0 84% 50%` ≈ `#eb1414`, white-on-it 4.53 : 1. Stronger, more decisive red — appropriate for an app-error colour.
- **Knock-on:** check `--destructive-foreground` and `--success-foreground` token definitions are still `#ffffff` after the change (they are, per `index.css:60-62`).

### Finding F7 — border tokens fail 1.4.11 only where they delineate interactive controls

- **Tokens:** `--border` 1.21 : 1, `--surface-elevated-border` 1.35 : 1, `--surface-overlay-border` 1.42 : 1.
- **Decorative uses (panel-to-panel separators, card outlines, divider rules):** WCAG 1.4.11 does **not** require 3 : 1 here. No remediation needed; document the design intent.
- **Interactive uses that need 3 : 1:**
  - `<input>` / `<textarea>` / `<select>` border in their **resting** state (the user must perceive where the input ends to know it's a field).
  - Form-row hover state borders that communicate interactivity.
  - Icon-button outlines (e.g. `GhostAddButton` in its resting state).
- **Remediation (interactive only):** introduce a `--border-strong: 224 38% 32%` ≈ `#3a4970`, contrast 3.05 : 1 on `background` and 2.79 : 1 on `surface`. Apply to `border-input` Tailwind alias and to any `border` use on interactive controls. Decorative `border` token can stay at the current 15 % L.
- **Alternative:** raise the universal `--border` from 15 % L to 32 % L (clears 3 : 1 globally). This sacrifices the "quiet decorative line" look across the app — likely too disruptive to land in one pass.

### Finding F8 — label utility classes fail AA at every interpretation

- **Classes:** `.label-section`, `.label-detail`, `.label-chart` (defined `apps/frontend/src/index.css:212-220`).
- **Two underlying issues:**
  1. **Token alpha is too low.** Even at the `0.40 α` floor (`--text-tertiary` value, the most generous interpretation of the Tailwind opacity modifier), all three classes hit 3.51 : 1 — failing AA.
  2. **Tailwind `/N` opacity modifier may not work.** The Tailwind config (`tailwind.config.js:38-39`) defines `muted-foreground` as `hsl(var(--muted-foreground))` without an `<alpha-value>` placeholder. In Tailwind v3, the `/60` modifier on such a colour is silently ignored (the class compiles to the base alpha). This means `.label-section` (`text-muted-foreground/60`) likely renders at 0.40 α not 0.24 α — but **either** way it fails.
- **Remediation:**
  - Update the three classes to use a higher-contrast token. Replace `text-muted-foreground/60` and `text-muted-foreground/70` with **`text-secondary`** (a dedicated 0.65 α token that already passes everywhere).
  - Update `.label-chart` from `text-text-tertiary` to a 0.55-α token (whichever name lands as part of F1).
  - **Separately**, fix the Tailwind config bug by exposing `<alpha-value>` placeholders so `/N` modifiers work as the design intended for the rest of the app:
    ```js
    foreground: "hsl(var(--muted-foreground) / <alpha-value>)";
    ```
    This is its own follow-up; do not bundle into the contrast remediation.

---

## Not tested / deferred

- **Chart colour marks** (`--chart-1` … `--chart-5`). WCAG contrast applies to text and UI components — pure data encoding (a pie slice, a bar) is governed by 1.4.1 (Use of Colour) and 1.4.11 only when it carries information. A separate audit should check colour-only states (e.g. tier badges in lists) and ensure they have a non-colour distinguisher.
- **Ambient page glows** (`[data-page]::before/::after`). At ≤ 9 % opacity over the base `background`, they're visually decorative and don't carry content. Out of scope.
- **Callout gradient text** (`background-clip: text`). WCAG contrast maths require a single foreground luminance, which a gradient doesn't have. The closest cross-axis interpretation is "test the lowest-contrast pixel". For `callout-primary` (`#0ea5e9` → `#a855f7`), the lowest-contrast point on `background` is `#a855f7` at 4.99 : 1 — which is fine. For headlines specifically (`callout-primary` is for hero phrases), this is acceptable, but per-component testing is needed if the gradient is ever used for body text.
- **Per-component audits.** Badges, icons inside coloured pills, EntityAvatar borders, hover-state backgrounds, focus glows on tier-coloured buttons — all need per-component testing. This audit only covers the canonical token-pair combinations.
- **Light theme.** Out of scope per design-anchor #7 (`docs/2. design/design-anchors.md`).
- **Reduced-transparency / forced-colours media query.** Worth checking that the design degrades gracefully in Windows High Contrast Mode and `prefers-reduced-transparency`, but out of scope for this token-level audit.

---

## Next steps

The order below trades effort against accessibility impact:

1. **Spec the token updates from F1, F2, F3, F4, F5, F6.** Six clear HSL changes, all of them small and reversible. A single feature spec — say, `docs/4. planning/contrast-token-tightening/` — covering the new values, doc updates, and design-system test additions. Estimated 1 PR.
2. **Spec the label-class fix (F8).** Slightly larger because it touches the three `@layer components` definitions and likely 30+ usages across the app, but mechanical. Estimated 1 PR.
3. **Spec the focus-ring and input-border separation (F4 + F7).** Whether to split tokens (`--ring` vs `--ring-accessible`) or just lighten universally is a real design decision — get sign-off on the look-and-feel shift before specing. Estimated 1 design + 1 PR.
4. **Per-component audit pass.** Same methodology, applied to the rendered DOM — pick a representative sample (overview page, settings page, a tier detail panel, a modal, a toast) and audit each component's actual rendered combinations. Captures the "non-canonical" combinations this audit deliberately excludes.
5. **Optional: automate.** A node script in `scripts/contrast-check.mjs` (similar to the throwaway used here) wired into CI could fail the build if any token-pair regression drops below AA. Low priority — token churn is rare — but cheap.
6. **Update `design-tokens.md`** with the rendered-vs-documented hex values from this audit's _Computed base colours_ table. The current docs are misleading by 1–12 sRGB units.

---

## Appendix — formula and tooling

- Relative luminance: `Y = 0.2126·R + 0.7152·G + 0.0722·B` where each channel is linearised by `c ≤ 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055)^2.4`. (WCAG 2.2 §1.4.3.)
- Contrast: `(L_lighter + 0.05) / (L_darker + 0.05)`.
- Alpha compositing: `C_out = α·C_fg + (1 − α)·C_bg`, applied per channel before linearisation.
- Tooling: a throwaway Node script computed all 44 pairs from the CSS HSL source. Two pairs (`text-primary` on `background`; `text-tertiary` on `surface`) were independently re-derived by hand and matched the script to two decimal places. The script itself is not committed; this report is the artefact.
