package com.mynikatech.memgine.poynt.model;

/** Exact Membership Purchase Offer resolved from a customer-generated QR token. */
public final class MembershipPurchaseOfferQr {
    public final String offerId;
    public final String displayName;

    public MembershipPurchaseOfferQr(String offerId, String displayName) {
        this.offerId = offerId;
        this.displayName = displayName;
    }
}
