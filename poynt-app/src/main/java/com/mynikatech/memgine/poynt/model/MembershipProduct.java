package com.mynikatech.memgine.poynt.model;
import java.util.List;
public final class MembershipProduct { public final String id,productStatusId,name,displayName,description; public final boolean isDeleted; public final List<Plan> plans; public MembershipProduct(String id,String productStatusId,String name,String displayName,String description,boolean isDeleted,List<Plan> plans){this.id=id;this.productStatusId=productStatusId;this.name=name;this.displayName=displayName;this.description=description;this.isDeleted=isDeleted;this.plans=plans;} }
