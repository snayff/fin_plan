# finplan — Claude Code Context

Household financial planning SaaS built around a **Waterfall** model: income → committed spend → discretionary spend → surplus. Multi-member household support, goals, forecasting, and asset/liability tracking.

Full-stack TypeScript monorepo: Fastify backend + React/Vite frontend + shared Zod schemas. Currently in active rebuild phase (`feature/renew_finplan` branch).

---

## Git Workflow

- **Always work on feature branches in worktrees.** Never commit directly to `main`/`prod`. Direct commits to `stage` are permitted only for hotfixes (see auto-memory `project_branching.md`); for all other work, branch off and PR in.
- Before starting work, verify the current branch with `git branch --show-current`.
- When opening PRs, target the correct base — `stage` by default, never `prod`/`main` unless explicitly instructed.

---

## Code Quality

- After every edit, run `bun run lint && bun run type-check` before committing. (Never use npm — see Commands.)
- Fix **all** lint errors, including unused imports. No partial fixes left behind.
- When investigating CI failures, read the **full** CI output — don't stop at the first error.
- **Implement batch changes incrementally.** After each file or logical group of changes, run lint and type-check before continuing. If anything fails, fix it before moving on.

---

## Commands

All commands use `bun run`. Never use npm or pnpm.

```bash
# Docker dev (primary workflow — postgres:5432, backend:3001, frontend:3000)
bun run start / stop / restart / docker:logs

# Outside Docker
bun run dev            # all apps via Turbo watch mode

# Database
bun run db:migrate / db:seed / db:studio

# Quality — lint has zero warnings policy
bun run lint / type-check / test / build
```

---

## Architecture

```
apps/
  backend/    # Fastify + Prisma + tRPC + JWT auth
  frontend/   # React 18 + Vite + Tailwind + TanStack Query + Zustand
packages/
  shared/     # Zod schemas and TypeScript types — imported by both apps
docs/
  0. reference/     # User references (AI cheatsheet, etc.)
  1. research/      # Competitor analysis
  2. design/        # Design anchors, philosophy, system, definitions
  3. architecture/  # Architecture, testing approach, auth lifecycle
  4. planning/      # Implementation plan + feature spec folders
  5. built/         # Completed features by category (income/committed/discretionary/surplus/overview/ui/infrastructure)
```

---

## Conventions

- **Package manager:** Bun — use `bun add`, `bun install`, `bun run`
- **TypeScript:** Strict mode with `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`. Prefix intentionally unused vars with `_`
- **Linting:** ESLint zero warnings — always run `bun run lint` before committing
- **Shared schemas:** Zod schemas live in `packages/shared/src/schemas/` — never duplicate between apps
- **Database changes:** Always use `bun run db:migrate` (interactive Prisma migrations) — never edit schema without a migration
- **No hardcoded colours:** Always use Tailwind design tokens — never hex values or `rgba()` in component code
- **No dashed borders:** Never use `border-dashed` in component code. The design system uses solid borders exclusively. Only two exceptions exist: `SnapshotDot` (auto vs manual distinction) and `CashflowYearBar` (today marker). All add/ghost buttons must follow the `GhostAddButton` pattern with solid borders.
- **Design-system enforcement:** Two layers catch drift automatically. `apps/frontend/eslint.config.js` blocks hex/`rgba()`/`border-dashed` in `className` strings and `min-h-screen`/missing-`min-h-0` in pages. `apps/frontend/src/design-system.test.tsx` asserts structural invariants (`PageHeader` presence, `TwoPanelLayout` delegation, `GhostAddButton` in curated right-panel headers, left-panel scroll anatomy). Add new pages to `EXEMPT_PAGES` only when they're legitimately special-cased (full-screen, auth).

---

## Panel Layout

All pages use `TwoPanelLayout`. Panel headers follow strict patterns defined in `docs/2. design/design-system.md` § 3.1.

- **Left panel headers** must use the `PageHeader` component — never inline markup
- **Left panel scroll structure:** Every left panel must use `flex flex-col h-full` with `PageHeader` as the first child and a `<div className="flex-1 overflow-y-auto">` wrapping all scrollable content below it. Page wrappers must use `h-full` (never `min-h-screen`) to maintain the height constraint chain.
- **Left panel content** (nav lists, summaries, selectors) uses `px-4` horizontal padding to align with `PageHeader`
- **Left panel nav buttons:** `px-4 py-2.5`, accent indicator pattern (`bg-{accent}/14 border-l-2 border-{accent} rounded-r-sm`)
- **Left panel footer:** `border-t border-foreground/10 px-4 py-3`
- **Right panel headers:** `px-4 py-3 border-b border-foreground/5`, title in `<h2>` with `font-heading text-base font-bold text-foreground`
- **Right panel add buttons:** use `GhostAddButton` pattern (`components/tier/GhostAddButton.tsx`) — never custom button styles

---

## UI/Design Standards

See `docs/2. design/design-system.md` for full details. Key invariants:

- No dashed borders (covered in Conventions above) — use solid borders or background-colour differentiation.
- All right panels must include `min-h-0` for proper scroll containment (paired with `flex-1 overflow-y-auto`).
- Use the shared subheading utility classes — never ad-hoc text styling.
- Tooltip / glossary placement follows the rules in `design-system.md`.
- Design-pattern documentation lives in `design-system.md`, **not** in this file.

---

## Project Structure / Domain Rules

Structural layout is in **Architecture** above. Domain rules:

- **Contributions** flow from the Discretionary waterfall — never directly from account forms.
- **Household members always exist** (at minimum, the current user). Never branch on "empty household".
- **`formatCurrency` requires the `showPence` setting** — verify the prop is threaded through to every sub-component that calls it.

---

## Security Conventions

- **Auth middleware required:** Every new route must use `authMiddleware` in `preHandler` unless explicitly public
- **householdId from middleware only:** Never accept householdId from URL params for data scoping — always use `req.householdId!`
- **Throw, don't inline errors:** Use error class hierarchy (`NotFoundError`, `AuthenticationError`, etc.), never `reply.status().send()` for errors
- **Audit all mutations:** Wrap every create/update/delete in `audited()` with `actorCtx(req)`
- **No `any` in security paths:** Auth middleware, token handling, and API client must be fully typed
- **Generic auth messages:** Login/register errors must never reveal whether an account exists
- **Error masking:** Use `NotFoundError` for both "not found" and "not owned" — never reveal resource existence to unauthorised callers

---

## Testing

Backend uses a **custom isolated per-file test runner** — do not use bare `bun test` for the backend:

```bash
# Run all backend tests
cd apps/backend && bun scripts/run-tests.ts

# Filter by pattern
cd apps/backend && bun scripts/run-tests.ts auth

# With coverage
cd apps/backend && bun scripts/run-tests.ts --coverage
```

Each test file runs in its own subprocess to prevent mock leakage between tests. Frontend uses MSW for HTTP mocking.

---

## Docs & Specs

Before implementing any feature, read the relevant specs in `docs/`:

- `docs/2. design/design-anchors.md` — non-negotiable product invariants (read first)
- `docs/2. design/design-system.md` — design tokens, components, typography, colour, motion
- `docs/2. design/definitions.md` — canonical tooltip text for financial terms
- `docs/3. architecture/` — architecture, testing approach, auth lifecycle
- `docs/4. planning/[feature]/` — feature spec folders (spec + plan per feature)

---

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`): lint + type-check → test (real postgres service) → build → deploy to Coolify (webhook on push to main).

---

## Design Context

Read `docs/2. design/design-anchors.md` first for non-negotiable invariants. Full design system in `docs/2. design/design-system.md`. Design philosophy and aesthetic direction in `docs/2. design/design-philosophy.md`. The product name is always "finplan" (lowercase).
