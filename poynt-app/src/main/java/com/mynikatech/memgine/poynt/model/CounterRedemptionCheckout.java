package com.mynikatech.memgine.poynt.model;

/**
 * Server-authoritative Counter redemption checkout state.
 *
 * Mirrors the web Counter's CounterRedemptionCheckout contract. The Poynt app
 * must not calculate basket totals or consume entitlements locally.
 */
public final class CounterRedemptionCheckout {
    public final String redemptionTransactionId;
    public final String transactionNumber;
    public final String redemptionStatus;
    public final String redemptionCompletedAt;
    public final String commerceTransactionId;
    public final String providerCode;
    public final String commerceStatus;
    public final Long subtotalMinor;
    public final Long adjustmentTotalMinor;
    public final Long taxTotalMinor;
    public final Long totalMinor;
    public final String currencyCode;
    public final String providerOrderId;
    public final String providerTransactionId;
    public final String failureCode;
    public final String failureMessage;
    public final boolean paymentRequired;

    public CounterRedemptionCheckout(
            String redemptionTransactionId,
            String transactionNumber,
            String redemptionStatus,
            String redemptionCompletedAt,
            String commerceTransactionId,
            String providerCode,
            String commerceStatus,
            Long subtotalMinor,
            Long adjustmentTotalMinor,
            Long taxTotalMinor,
            Long totalMinor,
            String currencyCode,
            String providerOrderId,
            String providerTransactionId,
            String failureCode,
            String failureMessage,
            boolean paymentRequired
    ) {
        this.redemptionTransactionId = redemptionTransactionId;
        this.transactionNumber = transactionNumber;
        this.redemptionStatus = redemptionStatus;
        this.redemptionCompletedAt = redemptionCompletedAt;
        this.commerceTransactionId = commerceTransactionId;
        this.providerCode = providerCode;
        this.commerceStatus = commerceStatus;
        this.subtotalMinor = subtotalMinor;
        this.adjustmentTotalMinor = adjustmentTotalMinor;
        this.taxTotalMinor = taxTotalMinor;
        this.totalMinor = totalMinor;
        this.currencyCode = currencyCode;
        this.providerOrderId = providerOrderId;
        this.providerTransactionId = providerTransactionId;
        this.failureCode = failureCode;
        this.failureMessage = failureMessage;
        this.paymentRequired = paymentRequired;
    }

    public boolean completed() {
        return "SUCCESS".equalsIgnoreCase(redemptionStatus)
                || "COMPLETED".equalsIgnoreCase(commerceStatus);
    }
}
