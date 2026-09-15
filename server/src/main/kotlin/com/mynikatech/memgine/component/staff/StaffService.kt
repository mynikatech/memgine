package com.mynikatech.memgine.component.staff
import com.mynikatech.memgine.exception.BadRequestException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
class StaffService(private val sql:StaffSql,private val json:Json=Json{encodeDefaults=false;explicitNulls=false}) { fun getAll(id:String)=json.parseToJsonElement(sql.getAll(id)); fun upsert(id:String,r:UpsertStaffRequest):JsonElement { if(listOf(r.staffId,r.organizationUserId,r.staffCode,r.roleId,r.actorUserId).any{it.isBlank()}) throw BadRequestException("Required staff fields are missing"); return json.parseToJsonElement(sql.upsert(id,json.encodeToString(r),r.actorUserId)) } }
