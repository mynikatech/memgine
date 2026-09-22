package com.mynikatech.memgine.poynt.model;

public final class PaymentIntent {
    public final String id;
    public final String providerCode;
    public final double amount;
    public final String currencyCode;

    public PaymentIntent(String id, String providerCode, double amount, String currencyCode) {
        this.id = id;
        this.providerCode = providerCode;
        this.amount = amount;
        this.currencyCode = currencyCode;
    }
}
