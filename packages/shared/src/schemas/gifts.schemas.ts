import { z } from "zod";
import {
  idSchema,
  nameSchema,
  nonNegativeMoneySchema,
  notesSchema,
  sortOrderSchema,
  yearSchema,
} from "./common.schemas";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const GiftDateTypeEnum = z.enum(["shared", "personal"]);
export type GiftDateType = z.infer<typeof GiftDateTypeEnum>;

export const GiftAllocationStatusEnum = z.enum(["planned", "bought", "skipped"]);
export type GiftAllocationStatus = z.infer<typeof GiftAllocationStatusEnum>;

export const GiftPlannerModeEnum = z.enum(["synced", "independent"]);
export type GiftPlannerMode = z.infer<typeof GiftPlannerModeEnum>;

// ─── Person ──────────────────────────────────────────────────────────────────

export const createGiftPersonSchema = z.object({
  name: nameSchema,
  notes: notesSchema.nullable().optional(),
  sortOrder: sortOrderSchema.optional(),
});

export const updateGiftPersonSchema = z.object({
  name: nameSchema.optional(),
  notes: notesSchema.nullable().optional(),
  sortOrder: sortOrderSchema.optional(),
});

export type CreateGiftPersonInput = z.infer<typeof createGiftPersonSchema>;
export type UpdateGiftPersonInput = z.infer<typeof updateGiftPersonSchema>;

// ─── Event ───────────────────────────────────────────────────────────────────

export const createGiftEventSchema = z
  .object({
    name: nameSchema,
    dateType: GiftDateTypeEnum,
    dateMonth: z.number().int().min(1).max(12).optional(),
    dateDay: z.number().int().min(1).max(31).optional(),
    sortOrder: sortOrderSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.dateType === "shared") {
      if (val.dateMonth === undefined || val.dateDay === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Shared-date events require dateMonth and dateDay",
        });
      }
    } else {
      if (val.dateMonth !== undefined || val.dateDay !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Personal-date events must not specify dateMonth/dateDay on the event",
        });
      }
    }
  });

export const updateGiftEventSchema = z.object({
  name: nameSchema.optional(),
  dateMonth: z.number().int().min(1).max(12).nullable().optional(),
  dateDay: z.number().int().min(1).max(31).nullable().optional(),
  sortOrder: sortOrderSchema.optional(),
});

export type CreateGiftEventInput = z.infer<typeof createGiftEventSchema>;
export type UpdateGiftEventInput = z.infer<typeof updateGiftEventSchema>;

// ─── Allocation ──────────────────────────────────────────────────────────────

export const upsertGiftAllocationSchema = z.object({
  planned: nonNegativeMoneySchema.optional(),
  spent: nonNegativeMoneySchema.nullable().optional(),
  status: GiftAllocationStatusEnum.optional(),
  notes: notesSchema.nullable().optional(),
  dateMonth: z.number().int().min(1).max(12).nullable().optional(),
  dateDay: z.number().int().min(1).max(31).nullable().optional(),
});

export type UpsertGiftAllocationInput = z.infer<typeof upsertGiftAllocationSchema>;

export const bulkUpsertCellSchema = z.object({
  personId: idSchema,
  eventId: idSchema,
  year: yearSchema,
  planned: nonNegativeMoneySchema,
});

export const bulkUpsertAllocationsSchema = z.object({
  cells: z.array(bulkUpsertCellSchema).max(500),
});

export type BulkUpsertCell = z.infer<typeof bulkUpsertCellSchema>;
export type BulkUpsertAllocationsInput = z.infer<typeof bulkUpsertAllocationsSchema>;

// ─── Budget + mode ───────────────────────────────────────────────────────────

export const setGiftBudgetSchema = z.object({
  annualBudget: nonNegativeMoneySchema,
});
export type SetGiftBudgetInput = z.infer<typeof setGiftBudgetSchema>;

export const setGiftPlannerModeSchema = z.object({
  mode: GiftPlannerModeEnum,
});
export type SetGiftPlannerModeInput = z.infer<typeof setGiftPlannerModeSchema>;

// ─── Read DTOs (server-shaped, mirrored on the frontend) ─────────────────────

export type GiftBudgetSummary = {
  annualBudget: number;
  planned: number;
  spent: number;
  plannedOverBudgetBy: number; // 0 if not over
  spentOverBudgetBy: number; // 0 if not over
};

export type GiftPersonRow = {
  id: string;
  name: string;
  notes: string | null;
  sortOrder: number;
  isHouseholdMember: boolean;
  plannedCount: number;
  boughtCount: number;
  plannedTotal: number;
  spentTotal: number;
  hasOverspend: boolean;
};

export type GiftAllocationRow = {
  id: string | null;
  giftPersonId: string;
  giftEventId: string;
  eventName: string;
  eventDateType: GiftDateType;
  eventIsLocked: boolean;
  year: number;
  planned: number;
  spent: number | null;
  status: GiftAllocationStatus;
  notes: string | null;
  dateMonth: number | null;
  dateDay: number | null;
  resolvedMonth: number | null;
  resolvedDay: number | null;
};

export type GiftPlannerStateResponse = {
  mode: GiftPlannerMode;
  year: number;
  isReadOnly: boolean;
  budget: GiftBudgetSummary;
  people: GiftPersonRow[];
  rolloverPending: boolean;
};

export type GiftPlannerSettingsResponse = {
  mode: GiftPlannerMode;
  syncedDiscretionaryItemId: string | null;
};

export type GiftPersonDetailResponse = {
  person: GiftPersonRow;
  allocations: GiftAllocationRow[];
};

export type GiftUpcomingCallouts = {
  thisMonth: { count: number; total: number };
  nextThreeMonths: { count: number; total: number };
  restOfYear: { count: number; total: number };
  dateless: { count: number; total: number };
};

export type GiftUpcomingGroup = {
  month: number; // 1–12 ; 0 represents Dateless
  rows: Array<{
    eventId: string;
    eventName: string;
    eventDateType: GiftDateType;
    day: number | null;
    recipients: Array<{
      personId: string;
      personName: string;
      planned: number;
      spent: number | null;
    }>;
    plannedTotal: number;
    spentTotal: number | null;
  }>;
};

export type GiftUpcomingResponse = {
  callouts: GiftUpcomingCallouts;
  groups: GiftUpcomingGroup[];
};
