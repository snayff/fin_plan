# Testing Readme

FinPlan uses a layered testing strategy across backend, frontend, and full-stack user journeys. Pick your layer based on what you're testing, then follow the linked doc for setup and patterns.

## Quick Decision Guide

| What I'm testing             | Layer | Doc                                                |
| ---------------------------- | ----- | -------------------------------------------------- |
| Pure function / utility      | A     | [backend-testing.md](backend-testing.md)           |
| Zod schema contract          | B     | [backend-testing.md](backend-testing.md)           |
| Backend business logic       | C     | [backend-testing.md](backend-testing.md)           |
| Backend HTTP endpoint        | D     | [backend-testing.md](backend-testing.md)           |
| Frontend component / page    | E     | [frontend-testing.md](frontend-testing.md)         |
| Full user journey in browser | F     | [user-journey-testing.md](user-journey-testing.md) |

## Run Commands

```bash
# Backend (Layers A–D) — custom isolated runner, required
cd apps/backend && bun scripts/run-tests.ts
cd apps/backend && bun scripts/run-tests.ts auth        # filter by pattern
cd apps/backend && bun scripts/run-tests.ts --coverage

# Frontend (Layer E)
cd apps/frontend && bun run test

# All (via Turbo)
bun run test
```
