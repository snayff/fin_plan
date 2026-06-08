---
feature: frontend-perf-budget
category: infrastructure
spec: docs/4. planning/frontend-perf-budget/frontend-perf-budget-spec.md
creation_date: 2026-05-17
status: backlog
implemented_date:
---

# Frontend Performance Budget — Implementation Plan

> **For Claude:** Use `/execute-plan frontend-perf-budget` to implement this plan task-by-task.

**Context:** finplan currently has no CI gate on frontend bundle size or runtime performance. A heavy dependency import or a routing regression can ship unnoticed and only surface when slow-network users complain. This plan adds two complementary CI gates — `size-limit` for bundle budgets and Lighthouse CI for per-route Performance + Accessibility — both running on every PR against `stage`. Both gates ship with baselines captured at first run; budgets are floors set ~10% above current measurements, not aspirational targets.

**Goal:** Add two failing-on-regression CI gates (bundle size via `size-limit`, route perf/a11y via Lighthouse CI) wired into `.github/workflows/ci.yml`.
**Spec:** `docs/4. planning/frontend-perf-budget/frontend-perf-budget-spec.md`
**Architecture:** `size-limit` is configured at the frontend workspace and runs against `apps/frontend/dist/**/*.js`. Lighthouse CI (`@lhci/cli`) runs against a production-built frontend served by `vite preview`, with the backend booted against an ephemeral postgres seeded by a new minimal Prisma script (`apps/backend/prisma/seed-perf.ts`). LHCI uses mobile profile, 3 samples per URL, median assertion. A new `frontend-perf` CI job depends on the existing build pipeline and runs on every PR to `stage`.
**Tech Stack:** Vite 6 · React 18 · `size-limit` · `@lhci/cli` · Prisma · GitHub Actions (ubuntu-latest)
**Infrastructure Impact:**

- Touches `packages/shared/`: no
- Requires DB migration: no (seed script only — no schema changes)

## Resolved Decisions (from /write-plan questions)

- **LHCI seed:** new `apps/backend/prisma/seed-perf.ts` — one user + household + small waterfall dataset.
- **LHCI profile:** mobile, 3 samples per URL, median.
- **CI runner:** `ubuntu-latest` (GitHub-hosted). 3-sample median mitigates runner-CPU variance.
- **Size delta PR comment:** **not shipping.** Spec ACs originally required `andresz1/size-limit-action`; user opted to skip it. Plan delivers CI failure only — the budget bump itself is the change record. The spec AC "CI posts a PR comment showing the size delta" is intentionally deferred; flagged at hand-off.
- **Per-route lazy chunk budgets:** out of scope; three entries only (initial JS, vendor, main entry).
- **Mobile/desktop split:** mobile-only as hard gate (desktop deferred to follow-up).

## Pre-conditions

- [ ] On a feature branch off `stage` (not committing direct to `stage`).
- [ ] `apps/frontend` builds clean via `bun run build` against current `stage`.
- [ ] Local Postgres available for the baseline run (Docker stack: `bun run start`).
- [ ] `.github/workflows/ci.yml` `test` job still functional (we're adding a sibling job, not modifying existing ones).

## Tasks

> Each task is one focused change. This is infrastructure / config work, so the "test" step is "run the command locally and observe the expected pass/fail," not a Bun unit test. Commits land per task.

---

### Task 1: Baseline measurement (no commit)

**Files:** none modified. This task captures the numbers that drive Tasks 3 and 7.

- [ ] **Step 1: Build the frontend on the current `stage` HEAD**

```bash
git fetch origin stage
git checkout origin/stage -- apps/frontend
bun install
cd apps/frontend && bun run build
```

- [ ] **Step 2: Record byte sizes of entry chunks**

```bash
# from apps/frontend
ls -la dist/assets/*.js | awk '{print $9, $5}'
# Note the three largest: index-*.js (main entry), vendor or react-vendor chunk, and the next-largest route chunk.
```

Record actual byte counts. Multiply by 1.10 for the size budget (10% headroom).

- [ ] **Step 3: Spin up the production stack and run an ad-hoc Lighthouse**

```bash
# from repo root
bun run start                # docker stack: postgres, backend, frontend prod build
# In another terminal, manually seed a test user via the existing register endpoint or DB
bunx lighthouse http://localhost:3000/login --preset=mobile --output=json --output-path=./baseline-login.json --quiet --chrome-flags="--headless"
bunx lighthouse http://localhost:3000/dashboard --preset=mobile --output=json --output-path=./baseline-dashboard.json --quiet --chrome-flags="--headless"
bunx lighthouse http://localhost:3000/waterfall --preset=mobile --output=json --output-path=./baseline-waterfall.json --quiet --chrome-flags="--headless"
```

(If `/dashboard` or `/waterfall` aren't the live route names, substitute the actual home-after-login + waterfall paths and update Task 6's `lighthouserc.json` accordingly.)

- [ ] **Step 4: Record Performance + Accessibility scores**

For each report:

```bash
node -e "const r=require('./baseline-login.json');console.log('perf',r.categories.performance.score*100,'a11y',r.categories.accessibility.score*100)"
```

Record both scores per route. The lowest-of-three perf score minus 5 is the perf budget; lowest-of-three a11y minus 2 is the a11y budget (floor with cushion).

- [ ] **Step 5: Restore working tree** (no commit)

```bash
git checkout HEAD -- apps/frontend
rm baseline-login.json baseline-dashboard.json baseline-waterfall.json
bun run stop
```

**Output of this task:** four numbers carried forward to Tasks 3 and 6:

- `SIZE_BUDGET_MAIN`, `SIZE_BUDGET_VENDOR`, `SIZE_BUDGET_INITIAL` (in KB, gzip)
- `PERF_FLOOR` (single integer; lowest-of-three minus 5; clamped to ≥ 75 per spec)
- `A11Y_FLOOR` (single integer; lowest-of-three minus 2; clamped to ≥ 95 per spec)

---

### Task 2: Install `size-limit` and its preset

**Files:**

- Modify: `apps/frontend/package.json`

- [ ] **Step 1: Install** (from `apps/frontend`)

```bash
bun add -D size-limit @size-limit/preset-app
```

`preset-app` is the right pick for a Vite SPA: it gzips, runs in a sandboxed brotli/gzip pass, and warms a headless Chromium for an execution-time check (we'll only use the size gate, not the time check, initially).

- [ ] **Step 2: Add the `size` script**

In `apps/frontend/package.json` scripts:

```json
"size": "size-limit"
```

- [ ] **Step 3: Verify install**

```bash
cd apps/frontend && bunx size-limit --help
```

Expected: prints help text, no module-not-found.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/package.json bun.lock
git commit -m "chore(frontend): add size-limit dev dependency"
```

---

### Task 3: Configure `size-limit` entries with baseline budgets

**Files:**

- Modify: `apps/frontend/package.json` (add `"size-limit"` field)

- [ ] **Step 1: Build current frontend so dist files exist for the dry-run**

```bash
cd apps/frontend && bun run build
```

- [ ] **Step 2: Add `"size-limit"` block to `apps/frontend/package.json`**

Substitute the three KB numbers captured in Task 1 (gzipped, +10% headroom, rounded up to the next whole KB).

```json
"size-limit": [
  {
    "name": "Initial JS (gzip, all entry chunks)",
    "path": "dist/assets/index-*.js",
    "limit": "<SIZE_BUDGET_INITIAL> KB",
    "gzip": true
  },
  {
    "name": "Vendor chunk (gzip)",
    "path": "dist/assets/*vendor*.js",
    "limit": "<SIZE_BUDGET_VENDOR> KB",
    "gzip": true
  },
  {
    "name": "Main app entry (gzip)",
    "path": "dist/assets/index-*.js",
    "limit": "<SIZE_BUDGET_MAIN> KB",
    "gzip": true
  }
]
```

If the current Vite build does not emit a chunk matching `*vendor*.js`, drop that entry and rely on the two index entries — Vite 6 default config inlines vendor into the main entry, in which case Task 3 reduces to two entries. Confirm during execution by listing `dist/assets/*.js`.

- [ ] **Step 3: Run locally — expect PASS**

```bash
cd apps/frontend && bun run size
```

Expected: PASS on all entries (because budget = current + 10%).

- [ ] **Step 4: Verify the gate actually fails on regression** (sanity check)

Temporarily lower the largest entry's `limit` by 50% in `package.json`, run `bun run size`, expect FAIL with "Size limit has been exceeded by ...". Revert the change. Do not commit the temporary lowering.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/package.json
git commit -m "chore(frontend): add size-limit budgets for entry/vendor/main chunks"
```

---

### Task 4: Wire `size-limit` into CI

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add a new `frontend-perf-size` job after the existing `check-compile` job**

Insert before the `deploy` job:

```yaml
# ─────────────────────────────────────────
# Frontend bundle size budget (runs on PRs)
# ─────────────────────────────────────────
frontend-perf-size:
  name: Frontend Bundle Size
  runs-on: ubuntu-latest
  if: github.event_name == 'pull_request'
  needs: [check-compile]

  env:
    DATABASE_URL: postgresql://finplan:unused@localhost:5432/unused

  steps:
    - uses: actions/checkout@v4

    - uses: oven-sh/setup-bun@v2
      with:
        bun-version: "1.3.9"

    - name: Cache bun dependencies
      uses: actions/cache@v4
      with:
        path: ~/.bun/install/cache
        key: bun-${{ runner.os }}-${{ hashFiles('bun.lock') }}
        restore-keys: bun-${{ runner.os }}-

    - name: Install dependencies
      run: bun install --frozen-lockfile

    - name: Generate Prisma Client
      run: cd apps/backend && bunx prisma generate

    - name: Build frontend
      run: cd apps/frontend && bun run build

    - name: Check bundle sizes
      run: cd apps/frontend && bun run size
```

`DATABASE_URL` is a dummy value required only because `bunx prisma generate` reads `.env` — no database is provisioned.

- [ ] **Step 2: Verify locally** (no live CI run; YAML syntax check)

```bash
# Optional: validate with actionlint if installed
actionlint .github/workflows/ci.yml
```

Or simply re-read the file to confirm indentation matches the surrounding jobs.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: gate PRs on frontend bundle-size budget via size-limit"
```

---

### Task 5: Add minimal LHCI seed script

**Files:**

- Create: `apps/backend/prisma/seed-perf.ts`
- Modify: `apps/backend/package.json` (add `seed:perf` script)

- [ ] **Step 1: Write the seed**

The seed creates one user (`lhci@test.local`), one household, and a handful of waterfall rows so `/dashboard` and `/waterfall` render meaningful content (not the empty state). Reuse existing service helpers where available — check `apps/backend/src/services/` for `createUser`/`createHousehold` patterns. If none exist as importable helpers, use raw Prisma calls and bcrypt for the password.

```typescript
// apps/backend/prisma/seed-perf.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const LHCI_USER_EMAIL = "lhci@test.local";
const LHCI_USER_PASSWORD = "LhciTestPassword123!"; // not a real credential; CI-scoped only

async function main() {
  await prisma.user.deleteMany({ where: { email: LHCI_USER_EMAIL } });

  const passwordHash = await bcrypt.hash(LHCI_USER_PASSWORD, 10);
  const user = await prisma.user.create({
    data: {
      email: LHCI_USER_EMAIL,
      passwordHash,
      // Match required fields from schema.prisma — adjust during execution if more required.
    },
  });

  const household = await prisma.household.create({
    data: {
      name: "LHCI Test Household",
      members: {
        create: {
          userId: user.id,
          role: "OWNER",
        },
      },
    },
  });

  // Minimal waterfall content: one income, one committed, one discretionary
  // Field names below are placeholders — confirm against schema.prisma during execution.
  // The goal is enough data to render non-empty UI, not full coverage.
  // ...insert seed rows here matching actual schema...

  console.log(
    JSON.stringify(
      { email: LHCI_USER_EMAIL, householdId: household.id },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

**Important:** during execution, before writing this file, read `apps/backend/prisma/schema.prisma` for `User`, `Household`, `HouseholdMember`, `Income`, `CommittedExpense`, `DiscretionarySpend` models and fill in the actual required fields. This plan only sketches the shape.

- [ ] **Step 2: Add the script to `apps/backend/package.json`**

```json
"seed:perf": "bun prisma/seed-perf.ts"
```

- [ ] **Step 3: Run locally against a fresh test DB**

```bash
# from apps/backend, with postgres running
DATABASE_URL=postgresql://finplan:finplan_dev_password@localhost:5432/finplan_test bunx prisma db push
DATABASE_URL=postgresql://finplan:finplan_dev_password@localhost:5432/finplan_test bun run seed:perf
```

Expected: prints `{ "email": "lhci@test.local", "householdId": "..." }` and exits 0.

- [ ] **Step 4: Verify login works against the seeded user**

```bash
# backend running against the test DB
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"lhci@test.local","password":"LhciTestPassword123!"}'
```

Expected: 200 with auth tokens.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/prisma/seed-perf.ts apps/backend/package.json
git commit -m "chore(backend): add minimal LHCI seed script"
```

---

### Task 6: Install LHCI and write `lighthouserc.json`

**Files:**

- Modify: `apps/frontend/package.json` (add `@lhci/cli`, add `lhci` script)
- Create: `apps/frontend/lighthouserc.json`

- [ ] **Step 1: Install**

```bash
cd apps/frontend && bun add -D @lhci/cli
```

- [ ] **Step 2: Add the `lhci` script**

```json
"lhci": "lhci autorun"
```

- [ ] **Step 3: Write `apps/frontend/lighthouserc.json`**

Substitute `PERF_FLOOR` and `A11Y_FLOOR` from Task 1. Substitute actual route paths from Task 1 if `/dashboard` and `/waterfall` aren't right.

```json
{
  "ci": {
    "collect": {
      "numberOfRuns": 3,
      "url": [
        "http://localhost:3000/login",
        "http://localhost:3000/dashboard",
        "http://localhost:3000/waterfall"
      ],
      "settings": {
        "preset": "desktop",
        "emulatedFormFactor": "mobile",
        "throttlingMethod": "simulate",
        "chromeFlags": "--headless --no-sandbox"
      }
    },
    "assert": {
      "aggregationMethod": "median",
      "assertions": {
        "categories:performance": ["error", { "minScore": <PERF_FLOOR_DECIMAL> }],
        "categories:accessibility": ["error", { "minScore": <A11Y_FLOOR_DECIMAL> }]
      }
    },
    "upload": {
      "target": "filesystem",
      "outputDir": ".lighthouseci"
    }
  }
}
```

`<PERF_FLOOR_DECIMAL>` is the integer floor / 100 (e.g. 75 → 0.75). Same for a11y.

For authed routes, LHCI needs a logged-in browser. Two approaches — pick (a) for simplicity:

(a) Add a `puppeteerScript` field to the `collect` block pointing to a small JS file that performs login via the API and sets the auth cookie/token in the page. Create `apps/frontend/lhci-login.js`:

```javascript
// apps/frontend/lhci-login.js
module.exports = async (browser, context) => {
  const page = await browser.newPage();
  await page.goto("http://localhost:3000/login");
  await page.type('input[name="email"]', "lhci@test.local");
  await page.type('input[name="password"]', "LhciTestPassword123!");
  await Promise.all([
    page.waitForNavigation(),
    page.click('button[type="submit"]'),
  ]);
  await page.close();
};
```

Confirm form field selectors during execution by inspecting `apps/frontend/src/pages/Login.tsx` (or equivalent). Reference the script in `lighthouserc.json`:

```json
"collect": {
  ...
  "puppeteerScript": "./lhci-login.js",
  "puppeteerLaunchOptions": { "args": ["--no-sandbox"] }
}
```

- [ ] **Step 4: Run locally** (with full stack + seeded test DB running)

```bash
cd apps/frontend && bun run lhci
```

Expected: PASS on all three URLs (because floors = baseline − cushion).

- [ ] **Step 5: Verify the gate fails on regression** (sanity)

Temporarily raise `categories:performance` `minScore` to `0.99` in `lighthouserc.json`, rerun. Expect FAIL. Revert.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/package.json apps/frontend/lighthouserc.json apps/frontend/lhci-login.js bun.lock
git commit -m "chore(frontend): add Lighthouse CI config and login script"
```

---

### Task 7: Wire LHCI into CI

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add a new `frontend-perf-lhci` job**

Insert after the `frontend-perf-size` job:

```yaml
# ─────────────────────────────────────────
# Lighthouse CI (runs on PRs)
# ─────────────────────────────────────────
frontend-perf-lhci:
  name: Frontend Lighthouse
  runs-on: ubuntu-latest
  if: github.event_name == 'pull_request'
  needs: [check-compile]
  timeout-minutes: 10

  services:
    postgres:
      image: postgres:16-alpine
      env:
        POSTGRES_USER: finplan
        POSTGRES_PASSWORD: finplan_dev_password
        POSTGRES_DB: finplan_test
      ports:
        - 5432:5432
      options: >-
        --health-cmd "pg_isready -U finplan"
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5

  env:
    DATABASE_URL: postgresql://finplan:finplan_dev_password@localhost:5432/finplan_test
    NODE_ENV: test
    JWT_SECRET: test-jwt-secret-that-is-at-least-32-characters-long-for-testing
    JWT_REFRESH_SECRET: test-jwt-refresh-secret-that-is-at-least-32-characters-long-for-testing
    COOKIE_SECRET: test-cookie-secret-that-is-at-least-32-characters-long-for-testing
    CORS_ORIGIN: http://localhost:3000

  steps:
    - uses: actions/checkout@v4

    - uses: oven-sh/setup-bun@v2
      with:
        bun-version: "1.3.9"

    - name: Cache bun dependencies
      uses: actions/cache@v4
      with:
        path: ~/.bun/install/cache
        key: bun-${{ runner.os }}-${{ hashFiles('bun.lock') }}
        restore-keys: bun-${{ runner.os }}-

    - name: Install dependencies
      run: bun install --frozen-lockfile

    - name: Generate Prisma Client
      run: cd apps/backend && bunx prisma generate

    - name: Push schema to test database
      run: cd apps/backend && bunx prisma db push

    - name: Seed LHCI test data
      run: cd apps/backend && bun run seed:perf

    - name: Build frontend
      run: cd apps/frontend && bun run build

    - name: Start backend
      run: cd apps/backend && bun run start &
      env:
        PORT: 3001

    - name: Start frontend preview
      run: cd apps/frontend && bunx vite preview --port 3000 --host 0.0.0.0 &

    - name: Wait for stack to be ready
      run: |
        for i in {1..30}; do
          curl -sf http://localhost:3000 >/dev/null && curl -sf http://localhost:3001/health >/dev/null && exit 0
          sleep 2
        done
        echo "Stack failed to start"; exit 1

    - name: Run Lighthouse CI
      run: cd apps/frontend && bun run lhci

    - name: Upload LHCI reports
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: lhci-reports
        path: apps/frontend/.lighthouseci/
        retention-days: 14
```

Notes for execution:

- Confirm backend exposes `/health` — if not, use a different readiness probe (e.g. `/api/health` or hit `/api/auth/login` with a 400-expected body).
- Confirm `cd apps/backend && bun run start` is the right invocation for a non-Docker backend boot. Likely it's `bun run src/index.ts` or similar — check `apps/backend/package.json` scripts during execution.

- [ ] **Step 2: Verify YAML**

Re-read the file; confirm indentation matches other jobs.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: gate PRs on Lighthouse perf + a11y for /login, /dashboard, /waterfall"
```

---

### Task 8: Document local usage and budget-bump policy

**Files:**

- Create: `docs/3. architecture/frontend-perf.md`
- Modify: `.claude/CLAUDE.md` (add a one-line pointer under `## CI/CD`)

- [ ] **Step 1: Write `docs/3. architecture/frontend-perf.md`**

Cover: what the two gates measure, the commands (`bun run size`, `bun run lhci`), how to read the output, when to bump the budget (real wins justify it; the bump itself is the change record), and the seed-user credentials note.

- [ ] **Step 2: Add a one-line pointer in `CLAUDE.md`** under `## CI/CD`:

```markdown
Frontend perf budgets: see `docs/3. architecture/frontend-perf.md`. Local: `cd apps/frontend && bun run size` or `bun run lhci`.
```

- [ ] **Step 3: Commit**

```bash
git add "docs/3. architecture/frontend-perf.md" .claude/CLAUDE.md
git commit -m "docs: frontend perf budget local commands and bump policy"
```

---

## Testing

> No Bun unit tests are added — this plan changes only config and CI. Per-task local runs validate behaviour.

### Local validation (must pass before opening PR)

- [ ] `cd apps/frontend && bun run build` succeeds clean.
- [ ] `cd apps/frontend && bun run size` reports PASS for all entries.
- [ ] `cd apps/frontend && bun run lhci` (with full stack + seeded DB) reports PASS for all three routes.
- [ ] Both gates demonstrably FAIL when a budget is intentionally lowered (verified in Task 3 Step 4 and Task 6 Step 5).

### CI validation (first PR run)

- [ ] `Frontend Bundle Size` job appears in CI checks, runs after `Check Compile`, and passes.
- [ ] `Frontend Lighthouse` job appears, runs in under 10 minutes (timeout caps it), and passes.
- [ ] On a regression-inducing test PR (push a heavy import like `import _ from "lodash"`), the size job fails with a clear "exceeded by N KB" message.

### Key Scenarios

- [ ] Happy path: PR with no perf impact → both new jobs PASS.
- [ ] Regression: PR adds 50 KB to entry chunk → `frontend-perf-size` FAILS, blocking merge.
- [ ] Legitimate growth: developer raises a budget by 20 KB in `package.json` `"size-limit"` block → CI PASSES, the bump is reviewable in the diff.
- [ ] a11y regression: developer adds a missing `aria-label` or contrast bug → LHCI Accessibility falls below floor → `frontend-perf-lhci` FAILS.

## Verification

- [ ] `bun run build` passes clean.
- [ ] `bun run lint` — zero warnings.
- [ ] `cd apps/frontend && bun run size` passes.
- [ ] `cd apps/frontend && bun run lhci` passes (with stack running, DB seeded).
- [ ] First CI run on the PR shows the two new jobs green.
- [ ] Manual: locally bump a `size-limit` value down by 50%, confirm `bun run size` exits non-zero with a clear message; revert.

## Post-conditions

- Any future PR pulling a heavy dependency or regressing route perf is blocked at PR time, not at user-complaint time.
- Group 3 (Playwright + jest-axe), if/when it ships, can reuse `apps/backend/prisma/seed-perf.ts` instead of writing its own seed.
- The `frontend-perf-lhci` job validates real-Chromium a11y (catches CSS-cascade-only failures that jest-axe in jsdom misses).
- Future enhancements (deferred): size-delta PR comment, desktop LHCI profile as a second non-gating metric, per-route lazy-chunk budgets, SEO/best-practices categories.

## Open items flagged for execution

These are real ambiguities that will need resolving at execution time, not now:

1. **Route names.** `/dashboard` and `/waterfall` are spec placeholders. Confirm the actual route paths from `apps/frontend/src/App.tsx` (or wherever routes live) and update Task 6 + Task 7.
2. **Vendor chunk existence.** Vite 6 may not emit a separate `*vendor*.js`. If absent, drop that entry from `size-limit` config in Task 3 — leave a one-line comment noting it.
3. **Backend boot command.** The Docker stack uses `bun run start`. Outside Docker the equivalent may differ. Check `apps/backend/package.json` `scripts` during Task 7 execution.
4. **Backend health endpoint.** Task 7 assumes `/health`. Confirm or substitute.
5. **Login form selectors.** Task 6's `lhci-login.js` uses `input[name="email"]` etc. Confirm against `apps/frontend/src/pages/Login.tsx` during execution.
6. **Schema field names in seed.** `seed-perf.ts` only sketches the data model. Read `schema.prisma` first.
7. **Spec AC deferred.** The "PR comment with size delta" acceptance criterion is intentionally not delivered in this plan (per user decision). Flag this in the PR description.
