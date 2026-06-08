---
feature: audit-log-durability
category: infrastructure
spec: docs/4. planning/audit-log-durability/audit-log-durability-spec.md
creation_date: 2026-05-17
status: backlog
implemented_date:
---

# Audit Log Durability — Implementation Plan

> **For Claude:** Use `/execute-plan audit-log-durability` to implement this plan task-by-task.

## Context

The current `auditService.log(entry)` helper is a fire-and-forget wrapper (`prisma.auditLog.create(...).catch(console.error)`) used at 8 sites in `auth.routes.ts` and referenced by one journey test. If the audit insert fails on a transient DB hiccup, the action is invisible — defeating brute-force detection and breaking compliance reconstruction. A separate gap exists at `export.service.ts:336`, which uses bare `prisma` outside any `$transaction`.

This change introduces a new `auditEvent()` helper for mutationless events (login attempts, logout, refresh) that performs a durable transactional write with bounded retry, then migrates all 8 auth-route call sites and the export-service call site to either `auditEvent()` or the existing `audited()` wrapper. The fire-and-forget `auditService.log` export is then **removed** so the unsafe pattern cannot be re-introduced, and an ESLint rule blocks any future direct use of `prisma.auditLog.create` outside `audit.service.ts`.

**Goal:** Eliminate fire-and-forget audit writes; every audit-eligible action is durably persisted.
**Spec:** `docs/4. planning/audit-log-durability/audit-log-durability-spec.md`
**Architecture:** Add a `auditEvent(entry)` helper to `audit.service.ts` that performs a single-row transactional insert with a 2-attempt / 100ms-backoff retry on transient Prisma errors (`P1001`, `P2024`). On retry exhaustion, structured-log the redacted payload via Fastify's logger / `pino` and rethrow. Migrate auth routes and `export.service.ts` to use it. Remove `auditService.log`. Add ESLint `no-restricted-syntax` rule blocking `*.auditLog.create` outside `audit.service.ts`.
**Tech Stack:** Fastify · Prisma · Zod (existing) — no frontend changes.
**Infrastructure Impact:**

- Touches `packages/shared/`: no
- Requires DB migration: no

**Resolved open questions:**

- Retry policy: 2 attempts, 100ms backoff between attempts (total ~100ms latency on first-failure path).
- Lint enforcement: ESLint `no-restricted-syntax` rule.
- `export.service.ts:336`: migrate to `auditEvent()`.
- DB-fully-unreachable case: structured-log on retry exhaustion, rethrow, accept loss (login fails anyway).

## Pre-conditions

- [ ] `audited()` wrapper exists and is unchanged in `apps/backend/src/services/audit.service.ts:177`.
- [ ] `prisma.auditLog` model exists (already present — no migration needed).
- [ ] Inline `auditLog.create` sites in services other than `export.service.ts` confirmed to be inside a `tx.$transaction` (verified during Phase 0 audit: `import.service.ts:636`, `cashflow.service.ts:494`, `member.service.ts:205`, `planner.service.ts:104`, `gifts.service.ts:463`, `household.service.ts:514`, `household.service.ts:649` — all safe).

## Files Touched

- Modify: `apps/backend/src/services/audit.service.ts` — add `auditEvent()`, retry helper, transient-error classifier; remove `auditService.log`.
- Modify: `apps/backend/src/services/audit.service.test.ts` — replace `auditService.log` tests with `auditEvent()` coverage.
- Modify: `apps/backend/src/routes/auth.routes.ts` — migrate all 8 call sites from `auditService.log` to `auditEvent()` (or `audited()` if mutating).
- Modify: `apps/backend/src/services/export.service.ts` — migrate `prisma.auditLog.create` at line 336 to `auditEvent()`.
- Modify: `apps/backend/src/test/journeys/auth.journey.test.ts` — drop the fire-and-forget polling comment; the audit row is now durable.
- Modify: `apps/backend/eslint.config.js` — add `no-restricted-syntax` rule blocking `prisma.auditLog.create` and `*.auditLog.create` outside `audit.service.ts`.
- Modify: `.claude/CLAUDE.md` — update Security Conventions to mention `auditEvent()`.

## Tasks

> Order: introduce `auditEvent()` (tested in isolation) → migrate call sites → remove the old export → enforce via lint → docs.

---

### Task 1: Add `auditEvent()` helper with retry — tests first

**Files:**

- Modify: `apps/backend/src/services/audit.service.ts`
- Test: `apps/backend/src/services/audit.service.test.ts`

- [ ] **Step 1: Replace the `describe("auditService.log", ...)` block with `describe("auditEvent", ...)` covering happy path, retry-then-success, retry-exhausted-rethrow, and structured-log fallback.**

```typescript
// apps/backend/src/services/audit.service.test.ts — replace lines 14–56
describe("auditEvent", () => {
  it("writes a single audit row and resolves on success", async () => {
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await auditEvent({
      userId: "user-1",
      action: "LOGIN_SUCCESS",
      resource: "session",
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: { userId: "user-1", action: "LOGIN_SUCCESS", resource: "session" },
    });
  });

  it("retries once on a transient Prisma error then succeeds", async () => {
    const transient = Object.assign(new Error("connection refused"), {
      code: "P1001",
    });
    prismaMock.auditLog.create
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce({} as any);

    await auditEvent({ action: "LOGIN_FAILED", resource: "session" });

    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(2);
  });

  it("does not retry on non-transient errors", async () => {
    const fatal = Object.assign(new Error("schema drift"), { code: "P2002" });
    prismaMock.auditLog.create.mockRejectedValue(fatal);

    await expect(auditEvent({ action: "LOGIN_FAILED" })).rejects.toBe(fatal);
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("rethrows and structured-logs the redacted payload after retries exhaust", async () => {
    const transient = Object.assign(new Error("pool timeout"), {
      code: "P2024",
    });
    prismaMock.auditLog.create.mockRejectedValue(transient);
    const errSpy = mock(() => {});
    const original = console.error;
    console.error = errSpy as unknown as typeof console.error;

    try {
      await expect(
        auditEvent({
          userId: "u1",
          action: "LOGIN_FAILED",
          resource: "session",
          metadata: { email: "alice@example.com" },
        }),
      ).rejects.toBe(transient);

      expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(2);
      expect(errSpy).toHaveBeenCalled();
      // Structured-log payload must not contain raw email
      const logged = JSON.stringify(errSpy.mock.calls[0]);
      expect(logged).not.toContain("alice@example.com");
      expect(logged).toContain("LOGIN_FAILED");
    } finally {
      console.error = original;
    }
  });
});
```

Also update the import at line 8:

```typescript
import { auditEvent, computeDiff, audited } from "./audit.service";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts audit.service`
Expected: FAIL — `auditEvent is not exported from "./audit.service"`.

- [ ] **Step 3: Implement `auditEvent()` and remove `auditService.log`**

Replace lines 52–62 of `apps/backend/src/services/audit.service.ts` with:

```typescript
/**
 * Transient Prisma error codes that justify a single retry.
 * P1001 = can't reach DB; P2024 = connection pool timeout.
 */
const TRANSIENT_AUDIT_ERROR_CODES = new Set(["P1001", "P2024"]);

function isTransientAuditError(err: unknown): boolean {
  if (err === null || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" && TRANSIENT_AUDIT_ERROR_CODES.has(code);
}

/** Redact PII-ish fields before logging an audit payload to stderr. */
function redactAuditEntry(entry: AuditLogEntry): Record<string, unknown> {
  const {
    metadata: _metadata,
    userAgent: _ua,
    ipAddress: _ip,
    ...safe
  } = entry;
  return {
    ...safe,
    metadataKeys: entry.metadata ? Object.keys(entry.metadata as object) : [],
  };
}

/**
 * Durable audit write for mutationless events (login attempts, refresh, logout).
 *
 * Performs a single-row transactional insert. On transient Prisma errors
 * (P1001 / P2024) retries once after 100ms. On retry exhaustion, logs a
 * structured error with a redacted payload and rethrows so the caller's
 * error handler can react.
 *
 * For mutations, use `audited()` instead — it co-commits the audit row with
 * the underlying change inside the same transaction.
 */
export async function auditEvent(entry: AuditLogEntry): Promise<void> {
  const MAX_ATTEMPTS = 2;
  const BACKOFF_MS = 100;

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await prisma.auditLog.create({ data: entry });
      return;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS && isTransientAuditError(err)) {
        await new Promise((r) => setTimeout(r, BACKOFF_MS));
        continue;
      }
      break;
    }
  }

  console.error("Audit log write failed after retries:", {
    entry: redactAuditEntry(entry),
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });
  throw lastError;
}
```

Delete the `export const auditService = { log(...) }` block entirely. The `AuditLogEntry` interface, `SYSTEM_FIELDS`, `isHiddenField`, `filterChanges`, `computeDiff`, `audited` and the `ActorCtx` / `AuditChange` types remain unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts audit.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/audit.service.ts apps/backend/src/services/audit.service.test.ts
git commit -m "feat(audit): add auditEvent() helper with bounded retry"
```

---

### Task 2: Migrate `auth.routes.ts` call sites to `auditEvent()`

**Files:**

- Modify: `apps/backend/src/routes/auth.routes.ts`

- [ ] **Step 1: Update the existing route test (if any) to expect `auditEvent` behaviour. The `auth.routes.test.ts` does not assert on the fire-and-forget log — `auditEvent` is awaited, so the existing test pattern (asserting on response codes only) continues to pass. Skip explicit red-step for this task; correctness is verified by the journey test in Task 3 and by `bun run type-check`.**

- [ ] **Step 2: Replace import and all 8 call sites**

Change the import at line 4:

```typescript
import { auditEvent } from "../services/audit.service";
```

Replace every `auditService.log({ ... });` block in this file with `await auditEvent({ ... });`:

- Line 117 (REGISTER) — inside the `register` handler, which is `async`. Becomes:

```typescript
await auditEvent({
  userId: result.user.id,
  action: "REGISTER",
  resource: "user",
  resourceId: result.user.id,
  ...requestContext(request),
});
```

- Line 147 (LOGIN_SUCCESS) — inside the `try` of `/login`. Becomes:

```typescript
await auditEvent({
  userId: result.user.id,
  action: "LOGIN_SUCCESS",
  resource: "session",
  ...ctx,
});
```

- Line 162 (LOGIN_FAILED) — inside the `catch`. Becomes:

```typescript
await auditEvent({
  action: "LOGIN_FAILED",
  resource: "session",
  metadata: { email: body.email },
  ...ctx,
});
```

- Line 197 (UPDATE_PROFILE), Line 227 (TOKEN_REFRESH), Line 267 (LOGOUT), Line 303 (SESSION_REVOKED), Line 323 (ALL_SESSIONS_REVOKED) — same `await auditEvent({ ... })` substitution. Preserve exact payload.

- [ ] **Step 3: Type-check**

Run: `bun run type-check`
Expected: PASS — no references to removed `auditService` symbol remain.

- [ ] **Step 4: Run auth tests**

Run: `cd apps/backend && bun scripts/run-tests.ts auth`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/auth.routes.ts
git commit -m "refactor(auth): migrate auditService.log call sites to durable auditEvent"
```

---

### Task 3: Update auth journey test — drop fire-and-forget polling

**Files:**

- Modify: `apps/backend/src/test/journeys/auth.journey.test.ts`

- [ ] **Step 1: Adjust the test to read the audit row synchronously after the response**

Replace lines 360–374 with:

```typescript
// auditEvent is awaited inside the route handler, so the row is durable by
// the time the response returns. No polling required.
const registerLog = await prisma.auditLog.findFirst({
  where: { userId, action: "REGISTER" },
});

expect(registerLog).not.toBeNull();
expect(registerLog!.resource).toBe("user");
expect(registerLog!.resourceId).toBe(userId);
```

- [ ] **Step 2: Run the journey test**

Run: `cd apps/backend && bun scripts/run-tests.ts auth.journey`
Expected: PASS — no polling timeout, audit row found on first read.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/test/journeys/auth.journey.test.ts
git commit -m "test(auth): drop fire-and-forget polling in auth journey"
```

---

### Task 4: Migrate `export.service.ts` bare-prisma audit write to `auditEvent()`

**Files:**

- Modify: `apps/backend/src/services/export.service.ts`

- [ ] **Step 1: Replace the bare `prisma.auditLog.create` block (lines 335–356)**

Add to existing imports:

```typescript
import { auditEvent } from "./audit.service";
```

Replace the block at line 335:

```typescript
// Write a single audit row for this export (read-only operation — durable awaited write).
if (ctx) {
  await auditEvent({
    userId: ctx.actorId,
    action: AuditAction.EXPORT_DATA,
    resource: "household",
    resourceId: householdId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    metadata: {
      counts: {
        members: result.members.length,
        subcategories: result.subcategories.length,
        incomeSources: result.incomeSources.length,
        committedItems: result.committedItems.length,
        discretionaryItems: result.discretionaryItems.length,
        assets: result.assets.length,
        accounts: result.accounts.length,
        // ...preserve all existing count fields, do not edit shape
      },
    },
  });
}
```

> **Note:** the prior call used `actorName` directly on the `auditLog` row. `AuditLogEntry` (the type accepted by `auditEvent`) does **not** include `actorName` — that field is only set by `audited()` from `ActorCtx`. If a `actorName` column is required on the row, expand `AuditLogEntry` to include the optional fields `actorName`, `householdId`, and add them in the new helper write. Confirm during execution by reading the AuditLog Prisma model; if those columns exist and the previous insert was setting them, extend `AuditLogEntry` accordingly in Task 1 before merging.

- [ ] **Step 2: Type-check and run export tests**

Run: `bun run type-check && cd apps/backend && bun scripts/run-tests.ts export`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/services/export.service.ts apps/backend/src/services/audit.service.ts
git commit -m "refactor(export): use durable auditEvent for export audit row"
```

---

### Task 5: Confirm remaining inline `tx.auditLog.create` sites are safe and tag them

**Files:**

- Modify: `apps/backend/src/services/import.service.ts:636`
- Modify: `apps/backend/src/services/cashflow.service.ts:494`
- Modify: `apps/backend/src/services/member.service.ts:205`
- Modify: `apps/backend/src/services/planner.service.ts:104`
- Modify: `apps/backend/src/services/gifts.service.ts:463`
- Modify: `apps/backend/src/services/household.service.ts:514`
- Modify: `apps/backend/src/services/household.service.ts:649`

- [ ] **Step 1: For each site, read 5 lines of context and confirm the surrounding `tx` is a `prisma.$transaction(async (tx) => { ... })` block.** If any site turns out to use the bare `prisma` client (unexpected — Phase 0 audit indicated otherwise), migrate it to `auditEvent()` using the same pattern as Task 4 instead.

- [ ] **Step 2: Add a single-line comment above each confirmed-safe `tx.auditLog.create` call:**

```typescript
// durable: committed atomically with the surrounding $transaction
await tx.auditLog.create({ ... });
```

- [ ] **Step 3: Type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/services/import.service.ts apps/backend/src/services/cashflow.service.ts apps/backend/src/services/member.service.ts apps/backend/src/services/planner.service.ts apps/backend/src/services/gifts.service.ts apps/backend/src/services/household.service.ts
git commit -m "docs(audit): tag transactional auditLog.create sites as durable"
```

---

### Task 6: Add ESLint rule blocking `auditLog.create` outside `audit.service.ts`

**Files:**

- Modify: `apps/backend/eslint.config.js`

- [ ] **Step 1: Add a `no-restricted-syntax` rule scoped to `src/**/\*.ts` excluding the audit service\*\*

```javascript
// apps/backend/eslint.config.js
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["src/**/*.ts"],
    ignores: [
      "src/services/audit.service.ts",
      "src/services/audit.service.test.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='create'][callee.object.property.name='auditLog']",
          message:
            "Do not call auditLog.create directly. Use audited() for mutations or auditEvent() for mutationless events.",
        },
      ],
    },
  },
  {
    files: ["src/**/*.test.ts", "src/test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      // Tests may mock prismaMock.auditLog.create — allow.
      "no-restricted-syntax": "off",
    },
  },
  {
    ignores: ["dist/", "node_modules/", "prisma/"],
  },
);
```

- [ ] **Step 2: Verify the rule fires on a temporary violation, then revert**

Temporarily add `await prisma.auditLog.create({ data: {} as any });` to `apps/backend/src/routes/auth.routes.ts`, run:

```bash
bun run lint
```

Expected: ERROR — "Do not call auditLog.create directly...". Then revert the test line.

- [ ] **Step 3: Run lint on the full backend**

Run: `bun run lint`
Expected: ZERO warnings, ZERO errors — all confirmed-safe `tx.auditLog.create` sites stay clean because the selector matches the receiver-property name `auditLog`. If the rule false-positives on transactional sites, narrow the selector to `[callee.object.name='prisma']` only, accept the slight loss of coverage, and document.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/eslint.config.js
git commit -m "chore(lint): block direct auditLog.create outside audit.service.ts"
```

> **Selector caveat:** the AST selector above matches any `*.auditLog.create(...)` — including `tx.auditLog.create` inside `audited()` and other transactional services. The rule is scoped to ignore `audit.service.ts`, but the inline `tx.auditLog.create` sites in `import/cashflow/member/planner/gifts/household` services WILL trip it. **Resolution during execution:** narrow the selector to `[callee.object.name='prisma']` so only bare-prisma calls fire. Tagging via comments (Task 5) remains the convention for the transactional sites. Confirm this trade-off when the lint rule lands.

---

### Task 7: Update CLAUDE.md security convention note

**Files:**

- Modify: `.claude/CLAUDE.md`

- [ ] **Step 1: Replace the audit bullet under Security Conventions**

Locate:

```markdown
- **Audit all mutations:** Wrap every create/update/delete in `audited()` with `actorCtx(req)`
```

Replace with:

```markdown
- **Audit all actions:** Wrap mutations in `audited()` with `actorCtx(req)`. For mutationless events (login attempts, logout, refresh) use `auditEvent()` from `audit.service.ts`. Never call `prisma.auditLog.create` directly — enforced by ESLint.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/CLAUDE.md
git commit -m "docs(claude): document auditEvent() and direct-write ban"
```

## Testing

### Backend Tests

- [ ] `auditEvent()` happy path: writes one row, awaits, resolves.
- [ ] `auditEvent()` transient-retry: P1001 then success → calls Prisma twice.
- [ ] `auditEvent()` non-transient: P2002 → no retry, immediate throw.
- [ ] `auditEvent()` retry-exhausted: P2024 twice → structured-log redacted payload, rethrow.
- [ ] `auth.routes.ts`: LOGIN_FAILED audit row is durably visible after the 401 response returns.
- [ ] `auth.routes.ts`: LOGIN_SUCCESS audit row visible after 200 response.
- [ ] `export.service.ts`: EXPORT_DATA audit row visible after the export call resolves.
- [ ] No type errors in any of the migrated files.
- [ ] `bun run lint` ESLint rule blocks new direct `prisma.auditLog.create` outside `audit.service.ts`.

### Frontend Tests

- [ ] None — no frontend changes.

### Key Scenarios

- [ ] Happy path: login → audit row written before response returns.
- [ ] Transient DB hiccup: simulated P1001 in `auditEvent()` retries once, succeeds, no observable failure to caller.
- [ ] DB fully unreachable: simulated 2× P2024 → structured-log payload appears in stderr; request handler rethrows; client sees a 500 (already the existing behaviour for unhandled errors).
- [ ] Existing `audited()` wrapper unchanged: any existing service test that uses `audited()` continues to pass (regression guard).

## Verification

- [ ] `bun run build` passes clean.
- [ ] `bun run lint` — zero warnings.
- [ ] `bun run type-check` passes.
- [ ] `cd apps/backend && bun scripts/run-tests.ts audit` passes.
- [ ] `cd apps/backend && bun scripts/run-tests.ts auth` passes (route tests + journey test).
- [ ] `cd apps/backend && bun scripts/run-tests.ts export` passes.
- [ ] `cd apps/backend && bun scripts/run-tests.ts` (full backend suite) passes.
- [ ] `grep -r "auditService.log" apps/backend/src` returns zero hits.
- [ ] `grep -r "auditService" apps/backend/src` returns zero hits (the export is fully gone).
- [ ] Manual: with `bun run start`, attempt a bad-password login; confirm an `auditLog` row with `action = "LOGIN_FAILED"` exists in postgres (`bun run db:studio`) before the response was returned (timestamp ≤ response time).

## Post-conditions

- [ ] Failed-login attempts are durable within the retry budget — brute-force detection has a reliable signal.
- [ ] Future audit call sites must go through `audited()` or `auditEvent()`; the unsafe pattern is unrepresentable in lint-clean code.
- [ ] Compliance reviewers can rely on `auditLog` rows for the full auth lifecycle (register, login success, login failure, refresh, logout, session revoke).
