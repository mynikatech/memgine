package com.mynikatech.memgine.poynt.model;

import java.util.List;

/** Server-resolved fixed-terminal context. Operator eligibility remains server authoritative. */
public final class TerminalContext {
    public final String organizationId;
    public final String organizationName;
    public final String storeId;
    public final String storeName;
    public final String deviceId;
    public final String deviceName;
    public final List<Staff> staff;

    public TerminalContext(
            String organizationId,
            String organizationName,
            String storeId,
            String storeName,
            String deviceId,
            String deviceName,
            List<Staff> staff
    ) {
        this.organizationId = organizationId;
        this.organizationName = organizationName;
        this.storeId = storeId;
        this.storeName = storeName;
        this.deviceId = deviceId;
        this.deviceName = deviceName;
        this.staff = staff;
    }
}
