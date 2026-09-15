package com.mynikatech.memgine.component.organizationuser

import kotlinx.serialization.Serializable

@Serializable
data class UpsertOrganizationUserRequest(val userId:String,val userCode:String,val firstName:String,val middleName:String?=null,val lastName:String?=null,val displayName:String?=null,val primaryEmail:String?=null,val primaryPhone:String,val preferredLanguageId:String?=null,val userStatusId:String?=null,val organizationUserId:String,val organizationUserTypeId:String,val organizationUserStatusId:String?=null,val organizationUserRoleId:String?=null,val roleId:String?=null,val joiningDate:String?=null,val actorUserId:String)
