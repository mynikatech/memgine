package com.mynikatech.memgine.poynt.model;

/** Sanitized terminal outcome only; it deliberately has no card or payment payload. */
public final class CommerceTerminalPaymentResult {
    public final String providerTransactionId;
    public final String providerStatus;
    public final long amountMinor;
    public final String currencyCode;
    public final String failureCode;
    public final String failureMessage;

    public CommerceTerminalPaymentResult(
            String providerTransactionId,
            String providerStatus,
            long amountMinor,
            String currencyCode,
            String failureCode,
            String failureMessage
    ) {
        this.providerTransactionId = providerTransactionId;
        this.providerStatus = providerStatus;
        this.amountMinor = amountMinor;
        this.currencyCode = currencyCode;
        this.failureCode = failureCode;
        this.failureMessage = failureMessage;
    }
}
