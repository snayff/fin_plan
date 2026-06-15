import { z } from "zod";
import {
  idSchema,
  nameSchema,
  nonNegativeMoneySchema,
  notesSchema,
  positiveMoneySchema,
} from "./common.schemas";

export const assetTypeSchema = z.enum(["Property", "Vehicle", "Other"]);
export const accountTypeSchema = z.enum([
  "Current",
  "Savings",
  "Pension",
  "StocksAndShares",
  "Other",
]);

// ─── Disposal helpers ────────────────────────────────────────────────────────
// `disposedAt` and `disposalAccountId` must be set together (or both cleared).
// undefined = field not in the patch (no change); null = explicit clear.
const isoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const disposalPair = {
  disposedAt: isoDateString.nullable().optional(),
  disposalAccountId: idSchema.nullable().optional(),
};

type DisposalShape = { disposedAt?: string | null; disposalAccountId?: string | null };

function disposalRefine(data: DisposalShape): boolean {
  const dateProvided = data.disposedAt !== undefined;
  const acctProvided = data.disposalAccountId !== undefined;
  if (!dateProvided && !acctProvided) return true;
  // When either field is in the patch, both must be present and match (both set or both null).
  if (dateProvided !== acctProvided) return false;
  const dateSet = data.disposedAt != null;
  const acctSet = data.disposalAccountId != null;
  return dateSet === acctSet;
}

const disposalRefineMessage: { message: string; path: (string | number)[] } = {
  message: "disposedAt and disposalAccountId must be set or cleared together",
  path: ["disposedAt"],
};

// Asset CRUD
export const createAssetSchema = z
  .object({
    name: nameSchema,
    type: assetTypeSchema,
    memberId: idSchema.nullable().optional(),
    growthRatePct: z.number().min(-100).max(100).nullable().optional(),
    initialValue: positiveMoneySchema.optional(),
    initialValueDate: isoDateString.optional(),
    ...disposalPair,
  })
  .refine(disposalRefine, disposalRefineMessage);

export const updateAssetSchema = z
  .object({
    name: nameSchema.optional(),
    memberId: idSchema.nullable().optional(),
    growthRatePct: z.number().min(-100).max(100).nullable().optional(),
    ...disposalPair,
  })
  .refine(disposalRefine, disposalRefineMessage);

export const recordAssetBalanceSchema = z.object({
  value: positiveMoneySchema,
  date: isoDateString,
  note: notesSchema.nullable().optional(),
});

// ISA helpers
type IsaShape = {
  isISA?: boolean;
  memberId?: string | null;
  type?: "Current" | "Savings" | "Pension" | "StocksAndShares" | "Other";
};

function isaRefine(data: IsaShape): boolean {
  if (data.isISA !== true) return true;
  if (data.memberId == null) return false;
  // type may be absent on update payloads; if present it must be Savings
  if (data.type !== undefined && data.type !== "Savings") return false;
  return true;
}

const isaRefineMessage: { message: string; path: (string | number)[] } = {
  message: "ISA accounts must be Savings type and have a memberId assigned",
  path: ["isISA"],
};

// Account CRUD
export const createAccountSchema = z
  .object({
    name: nameSchema,
    type: accountTypeSchema,
    memberId: idSchema.nullable().optional(),
    growthRatePct: z.number().min(0).max(100).nullable().optional(),
    monthlyContributionLimit: nonNegativeMoneySchema.nullable().optional(),
    isCashflowLinked: z.boolean().optional(),
    initialValue: positiveMoneySchema.optional(),
    initialValueDate: isoDateString.optional(),
    isISA: z.boolean().optional(),
    isaYearContribution: nonNegativeMoneySchema.nullable().optional(),
    ...disposalPair,
  })
  .refine(disposalRefine, disposalRefineMessage)
  .refine(isaRefine, isaRefineMessage);

export const updateAccountSchema = z
  .object({
    name: nameSchema.optional(),
    memberId: idSchema.nullable().optional(),
    growthRatePct: z.number().min(0).max(100).nullable().optional(),
    monthlyContributionLimit: nonNegativeMoneySchema.nullable().optional(),
    isCashflowLinked: z.boolean().optional(),
    isISA: z.boolean().optional(),
    isaYearContribution: nonNegativeMoneySchema.nullable().optional(),
    ...disposalPair,
  })
  .refine(disposalRefine, disposalRefineMessage)
  .refine(isaRefine, isaRefineMessage);

export const recordAccountBalanceSchema = z.object({
  value: positiveMoneySchema,
  date: isoDateString,
  note: notesSchema.nullable().optional(),
});

// Member profile (retirement fields)
export const updateMemberProfileSchema = z.object({
  dateOfBirth: z.string().datetime().nullable().optional(),
  retirementYear: z.number().int().min(2000).max(2100).nullable().optional(),
});

export type AssetType = z.infer<typeof assetTypeSchema>;
export type AccountType = z.infer<typeof accountTypeSchema>;
export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
export type RecordAssetBalanceInput = z.infer<typeof recordAssetBalanceSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type RecordAccountBalanceInput = z.infer<typeof recordAccountBalanceSchema>;
export type UpdateMemberProfileInput = z.infer<typeof updateMemberProfileSchema>;

// ISA allowance summary (response schema)
export const isaMemberPositionSchema = z.object({
  memberId: z.string(),
  name: z.string(),
  used: z.number().min(0),
  forecast: z.number().min(0),
  forecastedYearTotal: z.number().min(0),
  monthlyPlanned: z.number().min(0),
  estimatedFlag: z.boolean(),
});

export const isaAllowanceSummarySchema = z.object({
  taxYearStart: isoDateString,
  taxYearEnd: isoDateString,
  daysRemaining: z.number().int().min(0),
  annualLimit: z.number().min(0),
  byMember: z.array(isaMemberPositionSchema),
  // Count of active ISA accounts excluded from byMember because they have no
  // owning member (data-quality signal; see #143). Defaults to 0 so existing
  // payloads/fixtures that predate this field still parse; the backend always
  // sends the real count.
  memberlessIsaCount: z.number().int().min(0).default(0),
});

export type IsaMemberPosition = z.infer<typeof isaMemberPositionSchema>;
export type IsaAllowanceSummary = z.infer<typeof isaAllowanceSummarySchema>;
