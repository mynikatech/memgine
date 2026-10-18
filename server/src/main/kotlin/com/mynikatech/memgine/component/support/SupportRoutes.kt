package com.mynikatech.memgine.component.support

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*

private fun io.ktor.server.application.ApplicationCall.supportId() = parameters["requestId"] ?: throw BadRequestException("Support request id is required")
fun Route.supportRoutes(service:SupportService) {
 route("/customer/support-requests") {
  post { call.respond(ApiResponse.success(service.createCustomer(call.authenticatedPrincipal().userId,call.receive()),call.callId)) }
  get { call.respond(ApiResponse.success(service.customerList(call.authenticatedPrincipal().userId,call.request.queryParameters["limit"]?.toIntOrNull(),call.request.queryParameters["offset"]?.toIntOrNull()),call.callId)) }
  get("/{requestId}") { call.respond(ApiResponse.success(service.customerDetail(call.authenticatedPrincipal().userId,call.supportId()),call.callId)) }
  post("/{requestId}/messages") { call.respond(ApiResponse.success(mapOf("created" to service.customerMessage(call.authenticatedPrincipal().userId,call.supportId(),call.receive<AddSupportMessageDto>())),call.callId)) }
  post("/{requestId}/reopen") { call.respond(ApiResponse.success(mapOf("updated" to service.reopen(call.authenticatedPrincipal().userId,call.supportId(),call.receive<ReopenSupportRequestDto>())),call.callId)) }
  post("/{requestId}/close") { call.respond(ApiResponse.success(mapOf("updated" to service.close(call.authenticatedPrincipal().userId,call.supportId())),call.callId)) }
  post("/{requestId}/feedback") { call.respond(ApiResponse.success(mapOf("submitted" to service.submitFeedback(call.authenticatedPrincipal().userId,call.supportId(),call.receive<SubmitSupportFeedbackDto>())),call.callId)) }
 }
 route("/organizations/{organizationId}/support-requests") {
  get { val org=call.parameters["organizationId"]?:throw BadRequestException("Organization id is required"); call.respond(ApiResponse.success(service.orgList(org,call.authenticatedPrincipal().userId,call.request.queryParameters["category"],call.request.queryParameters["status"],call.request.queryParameters["priority"],call.request.queryParameters["limit"]?.toIntOrNull(),call.request.queryParameters["offset"]?.toIntOrNull()),call.callId)) }
  get("/{requestId}") { val org=call.parameters["organizationId"]?:throw BadRequestException("Organization id is required"); call.respond(ApiResponse.success(service.orgDetail(org,call.authenticatedPrincipal().userId,call.supportId()),call.callId)) }
  post("/{requestId}/messages") { call.respond(ApiResponse.success(mapOf("created" to service.orgMessage(call.authenticatedPrincipal().userId,call.supportId(),call.receive<AddSupportMessageDto>(),false)),call.callId)) }
  post("/{requestId}/internal-notes") { call.respond(ApiResponse.success(mapOf("created" to service.orgMessage(call.authenticatedPrincipal().userId,call.supportId(),call.receive<AddSupportMessageDto>(),true)),call.callId)) }
  get("/{requestId}/payment-investigation") { val org=call.parameters["organizationId"]?:throw BadRequestException("Organization id is required"); call.respond(ApiResponse.success(service.paymentInvestigation(org,call.authenticatedPrincipal().userId,call.supportId()),call.callId)) }
  get("/{requestId}/payment-exception-candidates") { val org=call.parameters["organizationId"]?:throw BadRequestException("Organization id is required"); call.respond(ApiResponse.success(service.paymentExceptionCandidates(org,call.authenticatedPrincipal().userId,call.supportId()),call.callId)) }
  post("/{requestId}/payment-investigation") { val org=call.parameters["organizationId"]?:throw BadRequestException("Organization id is required"); call.respond(ApiResponse.success(mapOf("investigationId" to service.escalatePaymentInvestigation(org,call.authenticatedPrincipal().userId,call.supportId(),call.receive<EscalatePaymentInvestigationDto>())),call.callId)) }
  post("/{requestId}/payment-exception-link") { val org=call.parameters["organizationId"]?:throw BadRequestException("Organization id is required"); call.respond(ApiResponse.success(mapOf("investigationId" to service.linkPaymentException(org,call.authenticatedPrincipal().userId,call.supportId(),call.receive<LinkPaymentExceptionDto>())),call.callId)) }
  post("/{requestId}/payment-investigation/transition") { val org=call.parameters["organizationId"]?:throw BadRequestException("Organization id is required"); call.respond(ApiResponse.success(mapOf("updated" to service.transitionPaymentInvestigation(org,call.authenticatedPrincipal().userId,call.supportId(),call.receive<UpdatePaymentInvestigationDto>())),call.callId)) }
  patch("/{requestId}") { val org=call.parameters["organizationId"]?:throw BadRequestException("Organization id is required"); call.respond(ApiResponse.success(mapOf("updated" to service.update(org,call.authenticatedPrincipal().userId,call.supportId(),call.receive())),call.callId)) }
 }
 route("/platform/support-requests") {
  get { call.respond(ApiResponse.success(service.platformList(call.authenticatedPrincipal().userId,call.request.queryParameters["organizationId"],call.request.queryParameters["category"],call.request.queryParameters["status"],call.request.queryParameters["priority"],call.request.queryParameters["destination"],call.request.queryParameters["limit"]?.toIntOrNull(),call.request.queryParameters["offset"]?.toIntOrNull()),call.callId)) }
  get("/{requestId}") { call.respond(ApiResponse.success(service.platformDetail(call.authenticatedPrincipal().userId,call.supportId()),call.callId)) }
  post("/{requestId}/notes") { call.respond(ApiResponse.success(mapOf("created" to service.platformMessage(call.authenticatedPrincipal().userId,call.supportId(),call.receive<AddSupportMessageDto>(),false)),call.callId)) }
  post("/{requestId}/recommendations") { call.respond(ApiResponse.success(mapOf("created" to service.platformMessage(call.authenticatedPrincipal().userId,call.supportId(),call.receive<AddSupportMessageDto>(),true)),call.callId)) }
  post("/{requestId}/replies") { call.respond(ApiResponse.success(mapOf("created" to service.platformReply(call.authenticatedPrincipal().userId,call.supportId(),call.receive<AddSupportMessageDto>())),call.callId)) }
  patch("/{requestId}") { call.respond(ApiResponse.success(mapOf("updated" to service.platformUpdate(call.authenticatedPrincipal().userId,call.supportId(),call.receive<UpdateSupportRequestDto>())),call.callId)) }
 }
}
