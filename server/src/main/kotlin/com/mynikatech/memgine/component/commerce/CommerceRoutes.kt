package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.*
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route

fun Route.commerceRoutes(service: CommerceService) {
    route("/organizations/{organizationId}") {
        route("/commerce") {
            route("/payment-provider-routes") {
                get {
                    call.respond(ApiResponse.success(service.paymentProviderRoutes(
                        orgId(call), call.request.queryParameters["storeId"],
                        call.authenticatedPrincipal().userId
                    ), call.callId))
                }
                get("/resolve") {
                    call.respond(ApiResponse.success(service.resolvePaymentProviderRoute(
                        orgId(call), call.request.queryParameters["storeId"],
                        required(call.request.queryParameters["sourceChannel"]),
                        call.authenticatedPrincipal().userId
                    ), call.callId))
                }
                post {
                    call.respond(HttpStatusCode.Created, ApiResponse.success(
                        service.createPaymentProviderRoute(
                            orgId(call), call.receive<CommercePaymentProviderRouteWriteDto>(),
                            call.authenticatedPrincipal().userId
                        ), call.callId))
                }
                put("/{routeId}") {
                    call.respond(ApiResponse.success(service.updatePaymentProviderRoute(
                        orgId(call), required(call.parameters["routeId"]),
                        call.receive<CommercePaymentProviderRouteWriteDto>(),
                        call.authenticatedPrincipal().userId
                    ), call.callId))
                }
                delete("/{routeId}") {
                    val versionNo = call.request.queryParameters["versionNo"]?.toIntOrNull()
                        ?: throw BadRequestException("Valid version number is required")
                    call.respond(ApiResponse.success(service.deletePaymentProviderRoute(
                        orgId(call), required(call.parameters["routeId"]), versionNo,
                        call.authenticatedPrincipal().userId
                    ), call.callId))
                }
            }
            get("/integrations") {
                call.respond(ApiResponse.success(service.integrations(orgId(call), call.authenticatedPrincipal().userId), call.callId))
            }
            get("/product-snapshots") {
                call.respond(ApiResponse.success(service.snapshots(orgId(call), call.authenticatedPrincipal().userId), call.callId))
            }
            post("/product-snapshots") {
                call.respond(HttpStatusCode.Created, ApiResponse.success(
                    service.saveSnapshot(orgId(call), call.receive<CommerceProductSnapshotWriteDto>(), call.authenticatedPrincipal().userId), call.callId))
            }
            get("/product-mappings") {
                call.respond(ApiResponse.success(service.mappings(orgId(call), call.authenticatedPrincipal().userId), call.callId))
            }
            delete("/product-mappings/{mappingId}") {
                call.respond(ApiResponse.success(
                    service.deactivateMapping(
                        orgId(call),
                        required(call.parameters["mappingId"]),
                        call.authenticatedPrincipal().userId
                    ),
                    call.callId
                ))
            }
            post("/products/{productId}/resolve-mapping") {
                call.respond(ApiResponse.success(
                    service.resolveProductMapping(
                        orgId(call),
                        required(call.parameters["productId"]),
                        call.receive<CommerceProductMappingResolutionDto>().selectedMappingId,
                        call.authenticatedPrincipal().userId
                    ),
                    call.callId
                ))
            }
            post("/product-mappings") {
                call.respond(HttpStatusCode.Created, ApiResponse.success(
                    service.saveMapping(orgId(call), call.receive<CommerceProductMappingWriteDto>(), call.authenticatedPrincipal().userId), call.callId))
            }
        }
        route("/commerce/integrations/{integrationConfigurationId}/catalog") {
            put("/configuration") {
                throw ForbiddenException("Poynt technical configuration is managed by Platform Admin")
            }
            post("/sync") { call.respond(ApiResponse.success(service.syncCatalog(orgId(call), required(call.parameters["integrationConfigurationId"]), call.request.queryParameters["storeId"], false, call.authenticatedPrincipal().userId), call.callId)) }
            post("/sync-incremental") { call.respond(ApiResponse.success(service.syncCatalog(orgId(call), required(call.parameters["integrationConfigurationId"]), call.request.queryParameters["storeId"], true, call.authenticatedPrincipal().userId), call.callId)) }
        }
        post("/commerce/product-mappings/{mappingId}/refresh") {
            call.respond(ApiResponse.success(service.refreshProductMapping(orgId(call), required(call.parameters["mappingId"]), call.authenticatedPrincipal().userId), call.callId))
        }
        route("/commerce/transactions") {
            post {
                call.respond(HttpStatusCode.Created, ApiResponse.success(service.createTransaction(
                    orgId(call), call.receive<CommerceTransactionCreateDto>(), call.authenticatedPrincipal().userId), call.callId))
            }
            get("/{transactionId}") {
                call.respond(ApiResponse.success(service.transaction(orgId(call), required(call.parameters["transactionId"]), call.authenticatedPrincipal().userId), call.callId))
            }
            post("/{transactionId}/lines/external-product") {
                call.respond(ApiResponse.success(service.addExternalProductLine(orgId(call), required(call.parameters["transactionId"]), call.receive<CommerceExternalProductLineCreateDto>(), call.authenticatedPrincipal().userId), call.callId))
            }
            post("/{transactionId}/lines/membership") {
                call.respond(ApiResponse.success(service.addMembershipLine(orgId(call), required(call.parameters["transactionId"]), call.receive<CommerceMembershipLineCreateDto>(), call.authenticatedPrincipal().userId), call.callId))
            }
            post("/{transactionId}/redemptions") {
                call.respond(ApiResponse.success(service.attachRedemption(orgId(call), required(call.parameters["transactionId"]), call.receive<CommerceRedemptionAttachDto>(), call.authenticatedPrincipal().userId), call.callId))
            }
            post("/{transactionId}/adjustments") {
                call.respond(ApiResponse.success(service.materializeAdjustment(orgId(call), required(call.parameters["transactionId"]), call.receive<CommerceAdjustmentMaterializeDto>(), call.authenticatedPrincipal().userId), call.callId))
            }
            post("/{transactionId}/ready") {
                call.respond(ApiResponse.success(service.markReady(orgId(call), required(call.parameters["transactionId"]), call.authenticatedPrincipal().userId), call.callId))
            }
            post("/{transactionId}/provider-order") {
                call.respond(ApiResponse.success(
                    service.submitProviderOrder(
                        orgId(call),
                        required(call.parameters["transactionId"]),
                        call.authenticatedPrincipal().userId
                    ),
                    call.callId
                ))
            }
            post("/{transactionId}/remote-terminal-payment/start") {
                call.respond(ApiResponse.success(service.startRemoteTerminalPayment(
                    orgId(call), required(call.parameters["transactionId"]), call.receive<CommerceRemoteTerminalPaymentStartRequest>(),
                    call.authenticatedPrincipal().userId
                ), call.callId))
            }
            post("/{transactionId}/terminal-payment/start") {
                call.respond(ApiResponse.success(service.startTerminalPayment(
                    orgId(call), required(call.parameters["transactionId"]), call.authenticatedPrincipal().userId
                ), call.callId))
            }
            post("/{transactionId}/terminal-payment/result") {
                call.respond(ApiResponse.success(service.recordTerminalPaymentResult(
                    orgId(call), required(call.parameters["transactionId"]), call.authenticatedPrincipal().userId,
                    call.receive<CommerceTerminalPaymentResultRequest>()
                ), call.callId))
            }
        }
        route("/benefits/{benefitId}/commerce-applicability") {
            get {
                call.respond(ApiResponse.success(service.benefitApplicability(orgId(call), required(call.parameters["benefitId"]), call.authenticatedPrincipal().userId), call.callId))
            }
            put {
                call.respond(ApiResponse.success(service.saveBenefitApplicability(
                    orgId(call), required(call.parameters["benefitId"]), call.receive<CommerceApplicabilityWriteDto>(), call.authenticatedPrincipal().userId), call.callId))
            }
        }
        route("/offers/{offerId}/membership-applicability") {
            get {
                call.respond(ApiResponse.success(service.membershipOfferApplicability(orgId(call), required(call.parameters["offerId"]), call.authenticatedPrincipal().userId), call.callId))
            }
            put {
                call.respond(ApiResponse.success(service.saveMembershipOfferApplicability(orgId(call), required(call.parameters["offerId"]), call.receive<MembershipOfferApplicabilityWriteDto>(), call.authenticatedPrincipal().userId), call.callId))
            }
            post("/deactivate") {
                call.respond(ApiResponse.success(service.deactivateMembershipOfferApplicability(
                    orgId(call), required(call.parameters["offerId"]), call.authenticatedPrincipal().userId
                ), call.callId))
            }
        }
        route("/offers/{offerId}/commerce-applicability") {
            get {
                call.respond(ApiResponse.success(service.offerApplicability(orgId(call), required(call.parameters["offerId"]), call.authenticatedPrincipal().userId), call.callId))
            }
            put {
                call.respond(ApiResponse.success(service.saveOfferApplicability(
                    orgId(call), required(call.parameters["offerId"]), call.receive<CommerceApplicabilityWriteDto>(), call.authenticatedPrincipal().userId), call.callId))
            }
            post("/deactivate") {
                call.respond(ApiResponse.success(service.deactivateOfferApplicability(
                    orgId(call), required(call.parameters["offerId"]), call.authenticatedPrincipal().userId
                ), call.callId))
            }
        }
    }
}

private fun orgId(call: io.ktor.server.application.ApplicationCall): String = required(call.parameters["organizationId"])
private fun required(value: String?): String = value?.takeIf { it.isNotBlank() }
    ?: throw BadRequestException("Required id is missing")
