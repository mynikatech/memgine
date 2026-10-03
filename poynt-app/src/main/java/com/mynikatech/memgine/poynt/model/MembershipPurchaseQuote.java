package com.mynikatech.memgine.poynt.model;

/** Server-authoritative membership purchase quote, including any applied Membership Offer. */
public final class MembershipPurchaseQuote {
    public final String planId;
    public final String membershipProductId;
    public final double subtotalAmount;
    public final String appliedOfferId;
    public final String adjustmentType;
    public final double discountAmount;
    public final double netSubtotalAmount;
    public final double taxRate;
    public final double taxAmount;
    public final double totalAmount;
    public final String currencyCode;
    public final String taxCode;
    public final String taxName;

    public MembershipPurchaseQuote(
            String planId,
            String membershipProductId,
            double subtotalAmount,
            String appliedOfferId,
            String adjustmentType,
            double discountAmount,
            double netSubtotalAmount,
            double taxRate,
            double taxAmount,
            double totalAmount,
            String currencyCode,
            String taxCode,
            String taxName
    ) {
        this.planId = planId;
        this.membershipProductId = membershipProductId;
        this.subtotalAmount = subtotalAmount;
        this.appliedOfferId = appliedOfferId;
        this.adjustmentType = adjustmentType;
        this.discountAmount = discountAmount;
        this.netSubtotalAmount = netSubtotalAmount;
        this.taxRate = taxRate;
        this.taxAmount = taxAmount;
        this.totalAmount = totalAmount;
        this.currencyCode = currencyCode;
        this.taxCode = taxCode;
        this.taxName = taxName;
    }

    public boolean hasOffer() {
        return appliedOfferId != null && !appliedOfferId.trim().isEmpty() && discountAmount > 0d;
    }
}
