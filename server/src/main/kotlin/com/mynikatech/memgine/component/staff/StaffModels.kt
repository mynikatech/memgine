package com.mynikatech.memgine.component.staff
import kotlinx.serialization.Serializable
@Serializable data class UpsertStaffRequest(val staffId:String,val organizationUserId:String,val staffCode:String,val roleId:String,val designation:String?=null,val storeId:String?=null,val staffStoreAssignmentId:String?=null,val assignmentStatusId:String?=null,val assignmentEndDate:String?=null,val joiningDate:String?=null,val relievingDate:String?=null,val staffStatusId:String?=null,val actorUserId:String)
