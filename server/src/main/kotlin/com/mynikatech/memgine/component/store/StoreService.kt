package com.mynikatech.memgine.component.store
import com.mynikatech.memgine.exception.BadRequestException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
class StoreService(private val sql:StoreSql,private val json:Json=Json{encodeDefaults=false;explicitNulls=false}) { fun getAll(id:String)=json.parseToJsonElement(sql.getAll(id)); fun upsert(id:String,r:UpsertStoreRequest):JsonElement { if(listOf(r.id,r.code,r.name,r.storeTypeId,r.addressLine1,r.city,r.state,r.postalCode,r.country,r.timezone,r.actorUserId).any{it.isBlank()}) throw BadRequestException("Required store fields are missing"); return json.parseToJsonElement(sql.upsert(id,json.encodeToString(r),r.actorUserId)) } }
