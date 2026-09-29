package com.mynikatech.memgine.poynt.model;

import java.util.List;

/** Server-derived Counter redemption candidates. Eligibility remains on the server. */
public final class RedemptionSelection {
    public final List<Item> benefits;
    public final List<Item> offers;

    public RedemptionSelection(List<Item> benefits, List<Item> offers) {
        this.benefits = benefits;
        this.offers = offers;
    }

    public static final class Item {
        public final String id, displayName, description, status, displayReason, badgeText;

        public Item(String id, String displayName, String description, String status,
                    String displayReason, String badgeText) {
            this.id = id;
            this.displayName = displayName;
            this.description = description;
            this.status = status;
            this.displayReason = displayReason;
            this.badgeText = badgeText;
        }

        public boolean available() { return "AVAILABLE".equals(status); }
    }
}
