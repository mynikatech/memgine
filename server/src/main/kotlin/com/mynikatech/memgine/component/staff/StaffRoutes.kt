package com.mynikatech.memgine.component.staff

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.CreateStaffTransactionRequestDto
import com.mynikatech.memgine.net.dto.CreateStaffStoreAssignmentRequestDto
import com.mynikatech.memgine.net.dto.UpdateStaffRequestDto
import com.mynikatech.memgine.net.dto.UpdateStaffStoreAssignmentRequestDto
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*

fun Route.staffRoutes(service: StaffService) {
    route("/organizations/{organizationId}") {
        route("/staff") {
            get {
                val organizationId = required(call.parameters["organizationId"], "Organization")
                call.respond(ApiResponse.success(service.list(organizationId), call.callId))
            }

            get("/{staffId}") {
                val organizationId = required(call.parameters["organizationId"], "Organization")
                val staffId = required(call.parameters["staffId"], "Staff")
                call.respond(ApiResponse.success(service.get(organizationId, staffId), call.callId))
            }

            post {
                val organizationId =
                    required(
                        call.parameters["organizationId"],
                        "Organization"
                    )

                val request =
                    call.receive<CreateStaffTransactionRequestDto>()

                call.respond(
                    ApiResponse.success(
                        service.create(
                            organizationId,
                            request
                        ),
                        call.callId
                    )
                )
            }

            put("/{staffId}") {
                val organizationId = required(call.parameters["organizationId"], "Organization")
                val staffId = required(call.parameters["staffId"], "Staff")
                val request =
                    call.receive<
                        UpdateStaffRequestDto
                    >()
                call.respond(ApiResponse.success(service.update(organizationId, staffId, request), call.callId))
            }

            delete("/{staffId}") {
                val organizationId = required(call.parameters["organizationId"], "Organization")
                val staffId = required(call.parameters["staffId"], "Staff")
                call.respond(ApiResponse.success(service.delete(organizationId, staffId), call.callId))
            }
        }

        route("/staff-store-assignments") {
            get {
                val organizationId = required(call.parameters["organizationId"], "Organization")
                call.respond(ApiResponse.success(service.listAssignments(organizationId), call.callId))
            }

            post {
                val organizationId = required(call.parameters["organizationId"], "Organization")
                val request = call.receive<CreateStaffStoreAssignmentRequestDto>()
                call.respond(ApiResponse.success(service.createAssignment(organizationId, request), call.callId))
            }

            put("/{assignmentId}") {
                val organizationId = required(call.parameters["organizationId"], "Organization")
                val assignmentId = required(call.parameters["assignmentId"], "Assignment")
                val request = call.receive<UpdateStaffStoreAssignmentRequestDto>()
                call.respond(ApiResponse.success(service.updateAssignment(organizationId, assignmentId, request), call.callId))
            }

            delete("/{assignmentId}") {
                val organizationId = required(call.parameters["organizationId"], "Organization")
                val assignmentId = required(call.parameters["assignmentId"], "Assignment")
                call.respond(ApiResponse.success(service.deleteAssignment(organizationId, assignmentId), call.callId))
            }
        }
    }
}

private fun required(value: String?, label: String): String =
    value?.takeIf { it.isNotBlank() }
        ?: throw BadRequestException("$label id is required")
