package com.mynikatech.memgine.component.customer

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.CustomerPurchaseRequestDto
import com.mynikatech.memgine.net.dto.CustomerPreferenceValueDto
import com.mynikatech.memgine.net.dto.AuthenticatedMembershipPaymentStartDto
import com.mynikatech.memgine.net.dto.PaymentStartRequestDto
import com.mynikatech.memgine.net.dto.CustomerCreateRedemptionTransactionRequest
import com.mynikatech.memgine.component.redemption.RedemptionService
import com.mynikatech.memgine.security.AuthenticatedPrincipalKey
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.application.ApplicationCall
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route

private fun ApplicationCall.organizationId(): String = parameters["organizationId"]
    ?: throw BadRequestException("Organization id is required")

private fun ApplicationCall.userId(): String = authenticatedPrincipal().userId

/** Customer use cases are separate from organization administration. */
fun Route.customerSelfServiceRoutes(service: CustomerService, redemptionService: RedemptionService) {
    route("/customer") {
        route("/discover") {
            get("/organizations") {
                call.respond(ApiResponse.success(service.discoverableOrganizations(), call.callId))
            }
            get("/organizations/{organizationId}") {
                call.respond(ApiResponse.success(
                    service.discoverableOrganization(call.organizationId()),
                    call.callId
                ))
            }
        }
        get("/relationships") {
            call.respond(ApiResponse.success(service.relationships(call.userId()), call.callId))
        }
        route("/organizations/{organizationId}") {
            post("/redemption-transactions") {
                val organizationId = call.organizationId()
                call.respond(ApiResponse.success(
                    redemptionService.createCustomerTransaction(
                        organizationId,
                        call.receive<CustomerCreateRedemptionTransactionRequest>(),
                        call.userId()
                    ),
                    call.callId
                ))
            }
            post("/redemption-transactions/{transactionId}/qr") {
                val transactionId = call.parameters["transactionId"]
                    ?: throw BadRequestException("Redemption transaction id is required")
                call.respond(ApiResponse.success(
                    redemptionService.issueCustomerTransactionQr(
                        call.organizationId(), transactionId, call.userId()
                    ),
                    call.callId
                ))
            }
            get("/redemption-transactions/{transactionId}") {
                val transactionId = call.parameters["transactionId"]
                    ?: throw BadRequestException("Redemption transaction id is required")
                call.respond(ApiResponse.success(
                    service.redemptionTransactionStatus(call.organizationId(), transactionId, call.userId()),
                    call.callId
                ))
            }
            get("/profile") {
                val org = call.organizationId()
                val customer = call.userId()
                call.respond(ApiResponse.success(service.relationships(customer)
                    .firstOrNull { it.organizationId == org }
                    ?: throw com.mynikatech.memgine.exception.ForbiddenException(
                        "Customer does not belong to this organization"), call.callId))
            }
            get("/subscriptions") {
                call.respond(ApiResponse.success(service.subscriptions(call.organizationId(), call.userId()), call.callId))
            }
            get("/history/subscriptions") {
                call.respond(ApiResponse.success(service.subscriptions(call.organizationId(), call.userId()), call.callId))
            }
            get("/history/redemptions") {
                call.respond(ApiResponse.success(service.redemptions(call.organizationId(), call.userId()), call.callId))
            }
            get("/subscriptions/{subscriptionId}/redemption-item-status") {
                val subscriptionId = call.parameters["subscriptionId"]
                    ?: throw BadRequestException("Subscription id is required")
                call.respond(ApiResponse.success(
                    service.redemptionItemStatuses(call.organizationId(), subscriptionId, call.userId()),
                    call.callId
                ))
            }
            get("/offers") {
                call.respond(ApiResponse.success(service.offers(call.organizationId(), call.userId()), call.callId))
            }
            get("/membership-products") {
                call.respond(ApiResponse.success(service.memberships(call.organizationId(), null), call.callId))
            }
            get("/benefits") {
                call.respond(ApiResponse.success(service.benefits(call.organizationId(), null), call.callId))
            }
            get("/benefits/{benefitId}/usage-rules") {
                val benefitId = call.parameters["benefitId"]
                    ?: throw BadRequestException("Benefit id is required")
                call.respond(ApiResponse.success(service.benefitRules(
                    call.organizationId(), call.userId(), benefitId), call.callId))
            }
            get("/stores") {
                call.respond(ApiResponse.success(service.stores(call.organizationId(), call.userId()), call.callId))
            }
            post("/purchases") {
                throw BadRequestException("Membership purchase requires verified payment confirmation")
            }
            get("/purchases/quote") {
                val planId = call.request.queryParameters["planId"]
                    ?: throw BadRequestException("Membership plan id is required")
                call.respond(ApiResponse.success(
                    service.purchaseQuote(call.organizationId(), call.userId(), planId),
                    call.callId
                ))
            }
            post("/purchases/otp/request") {
                val principal = call.attributes.getOrNull(AuthenticatedPrincipalKey)
                call.respond(ApiResponse.success(service.requestPurchaseOtp(call.organizationId(), call.receive(), principal?.userId), call.callId))
            }
            post("/purchases/otp/complete") {
                val principal = call.attributes.getOrNull(AuthenticatedPrincipalKey)
                call.respond(ApiResponse.success(service.completePurchaseOtp(call.organizationId(), call.receive(), principal?.userId), call.callId))
            }
            post("/purchases/payment/start") {
                call.respond(ApiResponse.success(
                    service.startPurchasePayment(
                        call.organizationId(),
                        call.receive<PaymentStartRequestDto>(),
                        call.authenticatedPrincipal().userId
                    ),
                    call.callId
                ))
            }
            post("/purchases/payment/start-authenticated") {
                call.respond(ApiResponse.success(
                    service.startAuthenticatedPurchasePayment(
                        call.organizationId(),
                        call.authenticatedPrincipal().userId,
                        call.receive<AuthenticatedMembershipPaymentStartDto>()
                    ),
                    call.callId
                ))
            }
            get("/preferences/{code}") {
                val code = call.parameters["code"] ?: throw BadRequestException("Preference code is required")
                call.respond(ApiResponse.success(CustomerPreferenceValueDto(
                    service.preference(call.organizationId(), call.userId(), code)), call.callId))
            }
            put("/preferences/{code}") {
                val code = call.parameters["code"] ?: throw BadRequestException("Preference code is required")
                val value = call.receive<CustomerPreferenceValueDto>().value
                    ?: throw BadRequestException("Preference value is required")
                call.respond(ApiResponse.success(CustomerPreferenceValueDto(
                    service.setPreference(call.organizationId(), call.userId(), code, value)), call.callId))
            }
        }
    }
}
