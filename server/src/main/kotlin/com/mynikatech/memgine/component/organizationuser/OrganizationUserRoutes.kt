package com.mynikatech.memgine.component.organizationuser
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*
import com.mynikatech.memgine.security.authenticatedPrincipal
fun Route.organizationUserRoutes(service:OrganizationUserService){ route("/organizations/{organizationId}/users"){ get { val id=call.parameters["organizationId"]?:throw BadRequestException("Organization id is required"); call.respond(ApiResponse.success(service.getAll(id),call.callId)) }; put { val id=call.parameters["organizationId"]?:throw BadRequestException("Organization id is required"); call.respond(ApiResponse.success(service.upsert(id,call.receive<UpsertOrganizationUserRequest>(),call.authenticatedPrincipal().userId),call.callId)) } } }
