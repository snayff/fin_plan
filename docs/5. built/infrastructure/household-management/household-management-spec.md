---
feature: household-management
status: implemented
priority: high
deferred: false
phase: 2
implemented_date: 2026-07-05
---

# Household Management

## Intention

FinPlan supports shared household finances. Members of the same household need a way to access and manage their shared plan, with clear roles controlling who can invite others and who can make changes.

## Description

Role-based access (Owner / Member) with a household switcher in the top nav for users who belong to multiple households. Owners can invite new members via a single-use 24-hour link (QR + URL, no email sent), remove members, and rename the household. Members can view and edit all data, and can leave a household at any time.

## User Stories

- As a household owner, I want to invite my partner via a link so that they can join without me managing their account setup.
- As a new user following an invite link, I want to create an account and join the household in one flow so that onboarding is seamless.
- As a member, I want to leave a household so that I stop seeing someone else's data if circumstances change.
- As a user with multiple households, I want to switch between them in the top nav so that I can access each plan independently.

## Acceptance Criteria

- [ ] Roles: Owner (view/edit all + manage members) / Member (view/edit all only)
- [ ] Household switcher dropdown in top nav
- [ ] Invite flow: single-use 24-hour link (QR code + URL), no email sent by the app
- [ ] Rate limit: 5 invites per hour per household
- [ ] New users following invite: create account and join in one flow
- [ ] Existing users following invite: confirmation step before joining
- [ ] Removing a member: immediate loss of access
- [ ] Renaming a household: owner only
- [ ] A member can leave at any time
- [ ] An owner cannot leave if they are the sole owner

## Open Questions

- [x] Can a user be an owner of one household and a member of another simultaneously? **Yes** — HouseholdMember role is per (householdId, userId) pair; a user can have different roles in different households.
- [x] What happens to a household if all owners leave or are removed? **Owners cannot leave if they are the sole owner** — this case is prevented. There is no orphan-household scenario.
- [x] Can ownership be transferred to another member? **Not yet implemented.** Ownership transfer and household deletion are intentionally deferred.

---

## Implementation

### Schema

```prisma
enum HouseholdRole {
  owner
  member
}

model Household {
  id        String            @id @default(cuid())
  name      String
  createdAt DateTime          @default(now())
  updatedAt DateTime          @updatedAt
  members   HouseholdMember[]
  invites   HouseholdInvite[]
}

model HouseholdMember {
  householdId String
  userId      String
  role        HouseholdRole @default(member)
  joinedAt    DateTime      @default(now())
  @@id([householdId, userId])
}

model HouseholdInvite {
  id              String    @id @default(cuid())
  householdId     String
  email           String
  tokenHash       String    @unique
  expiresAt       DateTime
  usedAt          DateTime?
  createdByUserId String
  createdAt       DateTime  @default(now())
}
```

### API

These routes already exist and are kept unchanged from the pre-rebuild codebase:

```
POST   /api/households                          → create household (creator becomes owner; creates HouseholdSettings)
GET    /api/households/:id                      → get household details
PATCH  /api/households/:id                      → rename (owner only)
GET    /api/households/:id/members              → list members
DELETE /api/households/:id/members/:userId      → remove member (owner only)
POST   /api/households/:id/invites              → create invite { email }
GET    /api/households/:id/invites              → list pending invites
DELETE /api/households/:id/invites/:inviteId    → cancel invite
POST   /api/invites/:token/accept               → accept invite (creates account or links existing)
```

### Components

- `HouseholdSwitcher.tsx` — dropdown in top nav; lists all households user belongs to; selecting sets `activeHouseholdId` on User; **kept unchanged** from pre-rebuild codebase

### Notes

- Invite flow: owner provides email → server creates 24-hour single-use token → displayed as QR code + copyable URL in UI — **no email sent by the app**
- Rate limit: 5 invites per hour per household; duplicate active invites to same address are prevented
- New user accept: create account (email must match invite email) + join household in one flow
- Existing user accept: confirmation step before joining
- Removing a member: immediate loss of access
- An owner cannot leave if they are the sole owner of a household
- `HouseholdSettings` is auto-created with defaults when a new household is created (post-create hook in `household.service.ts`)
