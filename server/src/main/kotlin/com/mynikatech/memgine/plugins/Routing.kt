package com.mynikatech.memgine.plugins

import com.mynikatech.memgine.component.entitystatus.*
import com.mynikatech.memgine.component.organization.*
import com.mynikatech.memgine.component.organizationuser.*
import com.mynikatech.memgine.component.referencedata.*
import com.mynikatech.memgine.component.staff.*
import com.mynikatech.memgine.component.store.*
import com.mynikatech.memgine.database.DatabaseContext
import com.mynikatech.memgine.model.common.ApiResponse
import io.ktor.server.application.*
import io.ktor.server.plugins.callid.callId
import io.ktor.server.response.respond
import io.ktor.server.routing.*

fun Application.configureRouting(database:DatabaseContext,referenceDataService:ReferenceDataService,entityStatusService:EntityStatusService){
 val organizationService=OrganizationService(database.jdbi.onDemand(OrganizationSql::class.java))
 val organizationUserService=OrganizationUserService(database.jdbi.onDemand(OrganizationUserSql::class.java))
 val storeService=StoreService(database.jdbi.onDemand(StoreSql::class.java))
 val staffService=StaffService(database.jdbi.onDemand(StaffSql::class.java))
 routing {
  get("/health"){call.respond(ApiResponse.success(mapOf("status" to "UP"),call.callId))}
  route("/api/v1"){ organizationRoutes(organizationService); organizationUserRoutes(organizationUserService); storeRoutes(storeService); staffRoutes(staffService); referenceDataRoutes(referenceDataService); entityStatusRoutes(entityStatusService) }
 }
}
