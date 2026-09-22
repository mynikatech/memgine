package com.mynikatech.memgine.poynt.model;
import java.util.List;
public final class TerminalContext { public final String organizationId, organizationName, storeId, storeName; public final List<Staff> staff; public TerminalContext(String organizationId,String organizationName,String storeId,String storeName,List<Staff> staff){this.organizationId=organizationId;this.organizationName=organizationName;this.storeId=storeId;this.storeName=storeName;this.staff=staff;} }
