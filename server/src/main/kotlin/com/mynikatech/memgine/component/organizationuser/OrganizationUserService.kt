package com.mynikatech.memgine.component.organizationuser
import com.mynikatech.memgine.exception.BadRequestException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
class OrganizationUserService(private val sql:OrganizationUserSql,private val json:Json=Json{encodeDefaults=false;explicitNulls=false}) {
 fun getAll(organizationId:String):JsonElement=json.parseToJsonElement(sql.getAll(organizationId))
 fun upsert(organizationId:String,r:UpsertOrganizationUserRequest):JsonElement { if(r.userId.isBlank()||r.organizationUserId.isBlank()||r.userCode.isBlank()||r.firstName.isBlank()||r.primaryPhone.isBlank()||r.organizationUserTypeId.isBlank()) throw BadRequestException("Required organization user fields are missing"); return json.parseToJsonElement(sql.upsert(organizationId,json.encodeToString(r),ORG_ADMIN_USER_ID)) }
 private companion object { const val ORG_ADMIN_USER_ID = "user-org-admin" }
}
