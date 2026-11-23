# Unified Counter checkout handover

## Checkpoint A — financial review

- The existing Counter preorder card displays server-provided item quantities, unit prices, line totals, discounts, tax, and total. Incomplete financial review or missing verification blocks starting payment.
- The final success message uses the existing order lifecycle payment and verification projection. Pending, failed or unresolved payments do not satisfy this condition.
- Immediate checkout re-reads its linked order before displaying the final outcome.
- Files changed in this checkpoint are `frontend/app/counter/index.tsx`, `frontend/src/ui/domain/counter-financial-state.ts` and `frontend/tests/counter-financial-state.test.cjs`.
- No migration was introduced. TypeScript compilation, Kotlin `:server:compileKotlin`, and `git diff --check` passed; the focused frontend tests passed (28 tests). Kotlin compilation emitted existing warnings.
- The order detail API and each real journey must be verified against live data before accepting the twelve scenarios.

## Checkpoint C — verification entry

- Counter can locate an existing order by its Store-scoped reference, then reuse the existing order-bound Phone OTP or Staff-Assisted verification dialog before financial review. Reference lookup alone never authorizes pickup.
- `frontend/src/ui/domain/CounterOrdersDashboard.tsx` exports the existing verification dialog. No new verification service or migration was introduced.
- Verification from the live QR scanner and the six-digit code continues through the existing Counter entry points. Runtime confirmation for all twelve paths remains outstanding.

## Checkpoint B — remaining

- The advance DEV simulator is not yet connected. Its existing implementation requires a provider order, Counter price acknowledgment, and a registered terminal binding. Supporting a simulator with no physical terminal requires a carefully scoped server and database adaptation. Existing payment callback and recovery paths must remain authoritative.
- The existing advance terminal and cash actions remain attached to the original order. Counter refreshes an unresolved advance payment on a bounded interval and retains manual refresh and existing timeout recovery.
- Next, inspect those existing prerequisites and implement a DEV-only simulation path that cannot dispatch to a real provider and retains durable attempt correlation. Compile and run the targeted tests after the change.

## Checkpoint D — validation and outstanding work

- The 12 combinations in `counter-financial-state.test.cjs` exercise the common outcome gate, not complete UI or PostgreSQL journeys. Existing Counter dashboard focused tests also pass. Real terminal/cash recovery, duplicate and late callbacks, wrong-Store authorization, and exactly-once handover remain unverified.
- No database was accessed, no SQL or migration changed, and no payment was initiated. Runtime and database integration testing requires an explicitly configured safe environment.
- The advance simulator remains unimplemented. Inspect the existing attempt-creation SQL and provider-order prerequisites before designing a DEV-only durable attempt without a physical terminal; do not bypass verification or reuse the membership finalizer. A forward migration may be needed if the existing database contract cannot safely support it.
- Exact changed files: `frontend/app/counter/index.tsx`, `frontend/src/ui/domain/CounterOrdersDashboard.tsx`, `frontend/src/ui/domain/counter-financial-state.ts`, `frontend/tests/counter-financial-state.test.cjs`, and this handover document.
