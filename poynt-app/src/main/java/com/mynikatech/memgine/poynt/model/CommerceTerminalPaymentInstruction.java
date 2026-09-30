package com.mynikatech.memgine.poynt.model;

/** Server-authoritative data required to invoke the Poynt Payment Fragment. */
public final class CommerceTerminalPaymentInstruction {
    public final String commerceTransactionId;
    public final String providerCode;
    public final String providerOrderId;
    public final long amountMinor;
    public final String currencyCode;
    public final String referenceId;

    public CommerceTerminalPaymentInstruction(
            String commerceTransactionId,
            String providerCode,
            String providerOrderId,
            long amountMinor,
            String currencyCode,
            String referenceId
    ) {
        this.commerceTransactionId = commerceTransactionId;
        this.providerCode = providerCode;
        this.providerOrderId = providerOrderId;
        this.amountMinor = amountMinor;
        this.currencyCode = currencyCode;
        this.referenceId = referenceId;
    }
}
