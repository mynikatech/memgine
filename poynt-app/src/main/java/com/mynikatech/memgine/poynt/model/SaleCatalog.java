package com.mynikatech.memgine.poynt.model;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** Mirrors Web Counter ownership and active product status comparison. */
public final class SaleCatalog {
    public final List<MembershipProduct> products;
    public final List<Subscription> currentSubscriptions = new ArrayList<>();
    private final Set<String> activeProductStatusIds;

    public SaleCatalog(List<MembershipProduct> products, List<Subscription> subscriptions, Set<String> activeProductStatusIds) {
        this.products = products;
        this.activeProductStatusIds = activeProductStatusIds;
        for (Subscription subscription : subscriptions) if ("ACTIVE".equalsIgnoreCase(subscription.statusName)) currentSubscriptions.add(subscription);
    }
    public boolean ownsProduct(String productId) { for (Subscription subscription : currentSubscriptions) if (productId.equals(subscription.membershipProductId)) return true; return false; }
    public boolean isAvailableForSale(MembershipProduct product) { return !product.isDeleted && activeProductStatusIds.contains(product.productStatusId) && !ownsProduct(product.id); }
}
