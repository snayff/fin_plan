# Frontend Performance Budget

Two CI gates run on every PR against `stage` to catch bundle bloat and runtime-perf regressions before they reach production.

---

## What the gates measure

### Bundle size — `size-limit`

Measures the gzip size of the built `dist/assets/` chunks against hard limits defined in `apps/frontend/package.json` (`"size-limit"` field).

Two entries are tracked:

- **Entry JS** — `dist/assets/index-*.js` (all entry chunks combined, gzip). Current limit: **144 KB**.
- **Largest shared chunk** — `dist/assets/AreaChart-*.js` (recharts + D3, the heaviest lazy chunk). Current limit: **118 KB**.

These limits were set at ~baseline + 10% headroom. They are floors, not targets.

### Lighthouse — `@lhci/cli`

Runs 3 Lighthouse audits per URL in mobile-simulated mode (Moto G4 profile, 3G throttling, 4× CPU slowdown), takes the median run, and asserts:

- **Performance ≥ 0.75** (75/100)
- **Accessibility ≥ 0.95** (95/100)

Three routes are audited: `/login`, `/overview`, `/waterfall`.

---

## Running locally

### Bundle size check

```bash
# from apps/frontend (dist must already exist)
cd apps/frontend && bun run build
bun run size
```

Output shows each entry's current size vs. limit. Exits non-zero if any limit is exceeded.

### Lighthouse CI

Full stack must be running with test data seeded:

```bash
# Terminal 1 — start postgres + backend + frontend preview
bun run start          # Docker Compose stack (or equivalent)

# Terminal 2 — seed test data (if not already seeded)
cd apps/backend && bun run db:seed

# Terminal 3 — run LHCI
cd apps/frontend && bun run lhci
```

Reports are written to `apps/frontend/.lighthouseci/` (gitignored). Open the HTML files for the full Lighthouse report.

---

## Interpreting output

**size-limit failure:**

```
Package size limit has exceeded by 12.3 kB
Size limit: 144 kB
Size:       156.3 kB  gzipped
```

Find the regression with `bun run build` and inspect `dist/assets/` to identify the new/changed chunk.

**LHCI failure:**

```
  × categories:performance failure for minScore assertion
      expected: >=0.75
      found: 0.61
```

Check the uploaded HTML report (available as a workflow artifact on the failed CI run) for the full audit with diagnostics.

---

## Bumping the budget

Both gates are intentional floors. If a PR legitimately increases the bundle (new feature, necessary dependency) or shifts a Lighthouse score, raise the limit in the relevant config file as part of the same PR. The diff is the change record — reviewers see and approve the bump explicitly.

**Bumping size-limit:** edit the `"limit"` field in `apps/frontend/package.json` → `"size-limit"` array.

**Bumping LHCI floors:** edit `"minScore"` values in `apps/frontend/lighthouserc.json`.

There is no `[skip ci]` mechanism for these gates. The bump PR is the intended escape hatch.

---

## Test credentials (LHCI only)

The LHCI CI job seeds the test database via `bun run db:seed` (which calls `apps/backend/src/db/seed.ts`). This creates:

- Email: `owner@finplan.test`
- Password: `BrowserTest123!`

These are CI-scoped test credentials. They do not match any production environment and should never be used outside of dev/CI databases.

---

## Coordination with other test layers

| Layer          | Tool               | What it catches                                       |
| -------------- | ------------------ | ----------------------------------------------------- |
| Component a11y | jest-axe (Group 3) | Missing ARIA in isolated component DOM (jsdom)        |
| Route a11y     | LHCI               | Contrast failures + full DOM cascade in real Chromium |
| Bundle size    | size-limit         | Heavy dependency imports, missing code-split          |
| Runtime perf   | LHCI Performance   | JS parse/execute time, render-blocking resources      |
