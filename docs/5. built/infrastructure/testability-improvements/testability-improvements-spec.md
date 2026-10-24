---
feature: testability-improvements
design_doc:
creation_date: 2026-03-26
status: implemented
implemented_date: 2026-07-05
---

# Testability Improvements

> **Purpose:** Captures _what_ this feature does and _why_ — developer stories, acceptance criteria, and interface-level implementation constraints. This is the input to `/write-plan`. It is intentionally not a technical plan: no Prisma syntax, no route code, no component file paths.

## Intention

Several categories of FinPlan's backend logic are untestable as written: date-sensitive functions depend on the live system clock; 7 of 10 route files have no test coverage; financial calculations have no consistent rounding convention; complex household scenarios require verbose manual mock setup. These gaps create reliability risk and slow down future development. This feature fixes them systematically.

## Description

Six concrete improvements: (1) a dependency-injected clock pattern for all date-sensitive functions, enabling boundary-condition tests without external dependencies; (2) complete route test coverage for the 7 currently untested route files; (3) a `toGBP()` rounding utility enforcing consistent 2dp arithmetic across waterfall and amortisation calculations; (4) TypeScript fixture snapshots for three realistic household scenarios used in service tests; (5) a realistic seed dataset for local development and browser testing; (6) Zod validation of `ReviewSession` JSON fields on read, catching serialisation drift before it reaches the frontend.

## Developer Stories

- As a developer, I want date-sensitive functions to accept an optional `now` parameter so that I can write deterministic tests for ISA tax year boundaries, Jan 1 snapshots, staleness, cashflow simulation, and gift date calculations without depending on the system clock.
- As a developer, I want route tests for all 7 untested route files so that auth enforcement, request schema validation, and response shapes are verified in CI.
- As a developer, I want a `toGBP(n)` rounding utility used consistently in calculation code so that financial arithmetic rounds predictably and tests can make exact numeric assertions.
- As a developer, I want pre-built fixture snapshots for common household scenarios so that service tests can reference realistic interconnected data without manually constructing it.
- As a developer, I want a realistic seed dataset so that the running app in local dev and browser testing reflects real usage rather than an empty state.
- As a developer, I want `ReviewSession` JSON fields validated on read so that serialisation bugs are caught with a clear error rather than causing silent undefined values on the frontend.

## Acceptance Criteria

### DI Clock Pattern

- [ ] The following functions accept an optional `now: Date = new Date()` parameter: `getISAAllowance` (wealth service), `ensureJan1Snapshot` (snapshot service), `monthsElapsed` / `isStale` (staleness util), `getGiftDates` (gift-dates util), `getCashflowByYear` (waterfall service)
- [ ] Each of these functions has at least one test that passes a synthetic `now` to exercise a date boundary
- [ ] The DI clock pattern is documented in `docs/3. architecture/testing/` as the project standard

### Route Tests

- [ ] `waterfall.routes.test.ts` exists and covers: unauthenticated → 401, invalid body → 400, valid authenticated request → correct 2xx, and all CRUD endpoints for income, committed bills, yearly bills, discretionary categories, and savings allocations
- [ ] `wealth.routes.test.ts` exists with equivalent coverage for accounts and ISA allowance endpoints
- [ ] `planner.routes.test.ts` exists with equivalent coverage for purchases, year budgets, and gift endpoints
- [ ] `review-session.routes.test.ts` exists with equivalent coverage for get, create/reset, update, and delete session
- [ ] `setup-session.routes.test.ts` exists with equivalent coverage for all wizard step endpoints
- [ ] `settings.routes.test.ts` exists with equivalent coverage for get and update household settings
- [ ] `snapshots.routes.test.ts` exists with equivalent coverage for list, create, get, and delete snapshot
- [ ] All new route tests follow the established pattern: mock service module + `buildTestApp()` + `errorHandler` + `app.inject()`

### Rounding Utility

- [ ] `toGBP(n: number): number` utility exists in `packages/shared/src/utils/`
- [ ] `toGBP` rounds to exactly 2 decimal places using `Math.round(n * 100) / 100`
- [ ] `toGBP` is applied in the waterfall surplus calculation, the amortisation schedule, and the ISA allowance remaining calculation
- [ ] `toGBP` is exported from `packages/shared`

### Fixture Snapshots

- [ ] `apps/backend/src/test/fixtures/scenarios.ts` defines and exports three scenarios:
  - `emptyHousehold` — household with one owner member, no income sources, no bills
  - `dualIncomeHousehold` — two members, two income sources (monthly salary each), two committed bills, one yearly bill, two discretionary categories, one savings allocation with a linked wealth account
  - `complexHousehold` — two members, mixed-frequency income (monthly + annual), committed and yearly bills, discretionary categories, savings allocations, wealth accounts with ISA, and planned purchases
- [ ] Each scenario exports the full interconnected mock object graph matching Prisma model shapes
- [ ] Scenarios are used in at least one waterfall service test and one wealth service test

### Seed Data

- [ ] `apps/backend/src/db/seed.ts` creates the browser test user (`owner@finplan.test` / `BrowserTest123!`) with a household populated with realistic data matching the `dualIncomeHousehold` scenario structure
- [ ] Seed is guarded: it only runs when `NODE_ENV !== 'production'`
- [ ] `bun run db:seed` runs cleanly on a freshly migrated database (idempotent: re-running does not error)
- [ ] The seeded household contains enough data for all main pages to render with non-empty states: waterfall, wealth, planner

### ReviewSession JSON Validation

- [ ] `confirmedItemsSchema` Zod schema defined in `packages/shared/src/schemas/review-session.schemas.ts`: `z.record(z.array(z.string()))`
- [ ] `updatedItemsSchema` Zod schema defined in the same file: `z.record(z.object({ from: z.number(), to: z.number() }))`
- [ ] `reviewSessionService.getSession()` parses both fields through their schemas after reading from the database and throws a `ValidationError` if parsing fails
- [ ] Both schemas are exported from `packages/shared`

## Open Questions

- [x] ~~What time-mocking approach — DI clock or external library?~~ **DI clock** (`now: Date = new Date()`). No new dependencies.
- [x] ~~Smoke tests or complete route coverage?~~ **Complete coverage** for all 7 routes.
- [x] ~~Fixture snapshots or scenario builder functions?~~ **Fixture snapshots** (TypeScript objects). Easier to read and maintain.
- [x] ~~What seed credentials?~~ **Browser test user**: `owner@finplan.test` / `BrowserTest123!` — consistent with existing browser test infrastructure.
- [x] ~~Should `toGBP` also be applied to the ISA allowance remaining calculation?~~ **Yes** — applied to waterfall, amortisation, and ISA allowance remaining.

---

## Implementation

> Interface-level constraints for the implementor. Describes _what_ is needed without specifying _how_ to build it. `/write-plan` makes the technical decisions.

### Schema

- **No new database entities.** All changes are to calculation functions, test helpers, and the seed script.
- **ReviewSession JSON validation (read-side):** Two Zod schemas — `confirmedItemsSchema` (`Record<string, string[]>`) and `updatedItemsSchema` (`Record<string, { from: number, to: number }>`) — added to `review-session.schemas.ts`. The service parses stored JSON against these schemas when reading a session; a parse failure throws a `ValidationError` with a clear message.
- **Seed data entities:** The seed creates: one user (owner), one household, one household member (owner role), household settings (defaults), income sources, committed bills, a yearly bill, discretionary categories, a savings allocation, and a wealth account. All consistent with Prisma model constraints.

### API

No new HTTP routes are added.

**New shared utility:**

- `toGBP(n: number): number` — exported from `packages/shared/src/utils/`. Applied in the waterfall service surplus calculation, in the amortisation schedule utility before each step's values are recorded, and in the ISA allowance remaining calculation.

**DI clock convention:**

- The following backend functions gain an optional `now: Date = new Date()` parameter: `getISAAllowance`, `ensureJan1Snapshot`, `getCashflowByYear`. The following frontend/shared utilities gain the same: `monthsElapsed`, `isStale`, `getGiftDatesForYear`.
- Call sites that do not pass `now` behave identically to before (default to `new Date()`).

### Components

No UI components are added or changed.

**New test infrastructure:**

- **`scenarios.ts`** — scenario fixture file at `apps/backend/src/test/fixtures/scenarios.ts`. Exports `emptyHousehold`, `dualIncomeHousehold`, and `complexHousehold` as plain TypeScript objects matching Prisma model shapes. Objects are compatible with the existing Prisma mock (`prismaMock`) — service tests can assign scenario data directly to mock return values.
- **7 new route test files** — one per untested route, co-located with each route file, following the established pattern from `auth.routes.test.ts` and `households.test.ts`.

### Notes

- **Seed idempotency:** The seed script should use upsert (or check-then-create) so that running it multiple times on the same database does not duplicate records or error. The user is identified by email; the household by name.
- **Seed production guard:** `if (process.env.NODE_ENV === 'production') { console.log('Seed skipped in production'); process.exit(0); }` at the top of the seed script.
- **Route test depth:** Each route test file must cover (a) 401 when `Authorization` header is absent for all protected endpoints, (b) 400 when request body fails Zod validation (where applicable), and (c) the happy-path 2xx response shape for each endpoint. This mirrors the depth of `auth.routes.test.ts`.
- **DI clock documentation:** A short section added to `docs/3. architecture/testing/backend-testing.md` explaining the `now: Date = new Date()` pattern and listing which functions use it.
- **`toGBP` is not the pence migration:** It is an interim measure to control floating-point drift while the full pence-integer arithmetic migration (`docs/4. planning/_future/pence-integer-arithmetic/`) is pending. The function should include a JSDoc comment to this effect.
