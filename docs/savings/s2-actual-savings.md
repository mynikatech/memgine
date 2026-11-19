# S2 actual savings

## Customer read contracts

Existing customer transaction history, organization receipt list, and receipt detail responses can include an optional `actualSavings` object for a completed Counter redemption. Existing receipt totals and the immutable JSON snapshot keep their current meanings.

| Field | Meaning |
|---|---|
| `transactionId`, `redemptionTransactionId`, `subscriptionId` | Original commerce order, linked redemption basket, and exact owned subscription. Missing or ambiguous links can leave a field null. |
| `currencyCode`, `completedAt` | Original commerce currency and completion timestamp. |
| `originalDiscountMinor` | Finalized benefit and offer discount in integer minor units when the receipt, payment and allocation evidence verify the original amount. |
| `reversalMinor`, `netSavingsMinor` | Verified reversed savings and the resulting net amount in the same currency. Treat these as unavailable unless `verificationState` is `VERIFIED`. A verified amount can be zero. |
| `verificationState` | `VERIFIED`, `NOT_FINALIZED`, `MISSING_OWNED_SUBSCRIPTION`, `MISSING_REDEMPTION_LINK`, `AMBIGUOUS_REDEMPTION_LINK`, `MISSING_FINALIZED_DISCOUNT`, `PAYMENT_RECONCILIATION_REQUIRED`, `MISSING_OR_AMBIGUOUS_PAYMENT`, `MISSING_APPLIED_DISCOUNT_EVIDENCE`, `AMBIGUOUS_ITEM_REVERSAL`, or `AMBIGUOUS_REFUND`. |

`GET /api/v1/customer/organizations/{organizationId}/subscriptions/{subscriptionId}/actual-savings` returns one row per recorded currency for the caller's subscription. Unknown currency gets its own coverage row. The API returns 404 for subscriptions outside the caller's ownership or organization. Cancelled and expired subscriptions use the same ownership check and can have verified totals.

- `COMPLETE` means the recorded amount for that currency has no known coverage gaps. Only this state exposes `netSavingsMinor` as the cumulative total.
- `PARTIAL` means `verifiedNetSavingsMinor` is the subtotal of verified rows for that currency. Unverified rows, unknown currency, or unattributed historical activity can prevent a complete total.
- `NO_VERIFIED_DATA` keeps both amounts null when relevant history exists but no amount can be verified for that currency.
- `NO_REDEMPTION_HISTORY` keeps both amounts null when available records show no completed order, consumed redemption, or unresolved attribution that could belong to the subscription. A pending basket by itself is not completed redemption history.
- `TOTAL_OUT_OF_RANGE` keeps the amounts null if a currency's total exceeds the signed 64-bit minor-unit contract.

`verifiedRedemptionCount` and `unverifiedRedemptionCount` count commerce orders in their currency bucket. `unattributedHistoryCount` counts coverage gaps across all currencies, including successful baskets, legacy benefit and offer usage, and completed orders omitted from the subscription's order set whose ownership or subscription could not be ruled out. These are evidence-gap counts and can include related records. A completed order with neither a known customer nor subscription can prevent completeness across the organization unless a single successful basket identifies it. Currency totals use exact integer minor units. Consumers should preserve integer precision when parsing large values.

## Evidence and reconciliation

`CounterCommercePaymentService` exposes `adjustmentTotalMinor` and `currencyCode` during pricing. The quote and the checkout response before completion are estimates. The original amount for S2 is the finalized `commerce_transactions.adjustment_total_minor`, corroborated by the immutable `transaction_receipts.discount_minor` and the sum of `APPLIED` rows in `commerce_transaction_adjustments`. The calculation uses neither current catalog prices nor S1 estimates.

`commerce_persist_counter_redemption_provider_order` records and validates the applied amounts. `commerce_complete_counter_redemption_zero_value`, the cash confirmation flow, and the terminal finalizer converge on `commerce_finalize_counter_redemption_transaction`. This function records item success and changes the redemption and commerce records to `SUCCESS` and `COMPLETED`. The existing `transaction_receipts_on_commerce_completed` trigger calls `issue_commerce_transaction_receipt` at that boundary. S2 reuses this hook and creates no additional finalization writes.

The read model matches `commerce_transaction_redemptions`, `redemption_transaction`, `subscriptions` and `organization_user` to the same customer and organization. It verifies the unique immutable receipt's commerce identity, kind, owner, currency and financial totals. Current receipt issuers copy the commerce completion timestamp, while historical attribution relies on source identity and financial evidence. A paid order requires one successful `commerce_provider_payment_attempts` row matching the finalized provider transaction, currency and paid amount. A zero-payable order requires successful redemption and matching receipt evidence with no successful payment attempt. An unresolved attempt, open payment exception, late capture or competing completed order makes the amount unavailable. Failed attempts do not multiply a successful order.

Completed `redemption_resolutions` events with restore actions are linked to each original item. A full basket restoration reverses the original discount. A partial basket restoration reverses only the immutable-finalized allocations of the restored whole items when the item-to-allocation mapping is complete. A `REFUND_AND_RESTORE` also requires a matching successful `payment_refunds` record. A linked `REFUND_ONLY` affects payment without changing savings. Unclassified refunds or restoration evidence that cannot establish the reversed items leave net savings unavailable. The current resolution record has no partial-quantity allocation event. S2 cannot verify quantity-level reversals within one item from those records.

Existing unique commerce and receipt IDs and the unique resolution per item provide idempotency. Each allocation must resolve to one item in the identified basket using the canonical type/source key before its amount is summed. Savings are recomputed as a read projection, so retrying a callback, restoration request or reconciliation pass cannot append another savings entry. Migration 299 adds two customer-scoped read functions and indexes for completed orders, completed baskets, basket items, benefit-use linkage, offer usage and commerce refunds. It grants function execution to the application role.

## Historical reconciliation and DEV fixture preparation

Historical transactions enter the same projection automatically when their canonical records contain all required evidence. No data migration or manual savings entries are needed. Run `DB/scripts/reconcile-redemption-actual-savings.sql` with psql variables `schema_name`, `organization_id`, `after_transaction_id` (blank for the first page), and `batch_size`. The read-only script uses these inputs in LOCAL, DEV and PROD. Its output includes the next cursor, verified attribution, rejection reason counts and separate counts for successful baskets or legacy uses without finance evidence. Keep the report in an access-controlled location. Restart from a blank cursor to include orders completed during a previous pass. Missing receipts, missing original allocations and late captures with no matching resolution remain reconciliation gaps.

`DB/env/dev/scripts/prepare-redemption-actual-savings-fixture.sql` prepares a repeatable fixture manifest from designated DEV test accounts and subscriptions, including GOLD, SILVER and a historical subscription. It verifies existing evidence for zero-payable, paid, zero-discount, retry, full restoration, partial basket restoration and noncompleted scenarios. Point psql at DEV explicitly and pass the provenance token and IDs described in the script. If a case is absent, the script reports `MISSING_FIXTURE`. Use the supported DEV checkout and recovery flows to create missing cases. The script runs read-only and creates no payment, refund or receipt records.

`DB/env/dev/scripts/prepare-redemption-actual-savings-pending-fixture.sql` covers a missing noncompleted case in LOCAL or DEV only. It uses a designated owned test subscription and existing, eligible Counter product selection. It prepares a pending basket and a commerce record through the canonical functions, verifies savings are unavailable and rolls back. It never calls provider pricing or payment or changes an existing transaction's status.
