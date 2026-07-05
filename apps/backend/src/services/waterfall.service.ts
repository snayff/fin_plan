// Composition root for the waterfall service. The concrete implementations live
// in cohesive sibling modules under ./waterfall/; this file assembles them into
// the single `waterfallService` object and re-exports the public types so the
// import path and public surface stay identical for routes and tests.

import * as summary from "./waterfall/summary.js";
import * as income from "./waterfall/income.crud.js";
import * as committed from "./waterfall/committed.crud.js";
import * as discretionary from "./waterfall/discretionary.crud.js";
import * as history from "./waterfall/history.js";

export type { InitialPeriodInput } from "./waterfall/shared.js";

export const waterfallService = {
  // ─── Summary ────────────────────────────────────────────────────────────────
  getWaterfallSummary: summary.getWaterfallSummary,

  // ─── Income sources ───────────────────────────────────────────────────────────
  listIncome: income.listIncome,
  createIncome: income.createIncome,
  updateIncome: income.updateIncome,
  deleteIncome: income.deleteIncome,
  confirmIncome: income.confirmIncome,

  // ─── Committed items ──────────────────────────────────────────────────────────
  listCommitted: committed.listCommitted,
  createCommitted: committed.createCommitted,
  updateCommitted: committed.updateCommitted,
  deleteCommitted: committed.deleteCommitted,
  confirmCommitted: committed.confirmCommitted,

  // ─── Yearly items (CommittedItem with spendType=yearly) ─────────────────────
  listYearly: committed.listYearly,
  createYearly: committed.createYearly,
  updateYearly: committed.updateYearly,
  deleteYearly: committed.deleteYearly,
  confirmYearly: committed.confirmYearly,

  // ─── Discretionary items ─────────────────────────────────────────────────────
  listDiscretionary: discretionary.listDiscretionary,
  listDiscretionaryStale: discretionary.listDiscretionaryStale,
  createDiscretionary: discretionary.createDiscretionary,
  updateDiscretionary: discretionary.updateDiscretionary,
  deleteDiscretionary: discretionary.deleteDiscretionary,
  confirmDiscretionary: discretionary.confirmDiscretionary,

  // ─── Savings (DiscretionaryItem in Savings subcategory) ─────────────────────
  listSavings: discretionary.listSavings,
  createSavings: discretionary.createSavings,
  updateSavings: discretionary.updateSavings,
  deleteSavings: discretionary.deleteSavings,
  confirmSavings: discretionary.confirmSavings,

  // ─── History ──────────────────────────────────────────────────────────────────
  getHistory: history.getHistory,

  // ─── Batch confirm ────────────────────────────────────────────────────────────
  confirmBatch: history.confirmBatch,

  // ─── Delete all ───────────────────────────────────────────────────────────────
  deleteAll: history.deleteAll,
};
