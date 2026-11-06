-- A period can move an item's payment date as well as its amount. NULL means
-- the period keeps the item's own dueDate.
-- AlterTable
ALTER TABLE "item_amount_periods" ADD COLUMN "dueDate" DATE;
