package com.mynikatech.memgine.component.counter

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.*
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route

fun Route.counterRoutes(service: CounterService) {
    route("/organizations/{organizationId}/counter") {
        get("/customers") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            val store = call.request.queryParameters["storeId"] ?: throw BadRequestException("Store id is required")
            val staff = call.request.queryParameters["staffId"] ?: throw BadRequestException("Staff id is required")
            call.respond(ApiResponse.success(service.customers(org, store, staff, call.authenticatedPrincipal()), call.callId))
        }
        get("/subscriptions") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            val store = call.request.queryParameters["storeId"] ?: throw BadRequestException("Store id is required")
            val staff = call.request.queryParameters["staffId"] ?: throw BadRequestException("Staff id is required")
            call.respond(ApiResponse.success(service.subscriptions(org, store, staff, call.authenticatedPrincipal()), call.callId))
        }
        get("/subscriptions/{subscriptionId}/benefits") {
            val org =
                call.parameters["organizationId"]
                    ?: throw BadRequestException("Organization id is required")

            val subscriptionId =
                call.parameters["subscriptionId"]
                    ?: throw BadRequestException("Subscription id is required")

            val store =
                call.request.queryParameters["storeId"]
                    ?: throw BadRequestException("Store id is required")

            val staff =
                call.request.queryParameters["staffId"]
                    ?: throw BadRequestException("Staff id is required")

            call.respond(
                ApiResponse.success(
                    service.subscriptionBenefits(
                        org,
                        store,
                        staff,
                        subscriptionId,
                        call.authenticatedPrincipal()
                    ),
                    call.callId
                )
            )
        }
        get("/redemptions") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            val store = call.request.queryParameters["storeId"] ?: throw BadRequestException("Store id is required")
            val staff = call.request.queryParameters["staffId"] ?: throw BadRequestException("Staff id is required")
            call.respond(ApiResponse.success(service.redemptions(org, store, staff, call.authenticatedPrincipal()), call.callId))
        }
        get("/qr-samples") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            val store = call.request.queryParameters["storeId"] ?: throw BadRequestException("Store id is required")
            val staff = call.request.queryParameters["staffId"] ?: throw BadRequestException("Staff id is required")
            call.respond(ApiResponse.success(service.qrSamples(org, store, staff, call.authenticatedPrincipal()), call.callId))
        }
        get("/staff-name") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            val store = call.request.queryParameters["storeId"] ?: throw BadRequestException("Store id is required")
            val staff = call.request.queryParameters["staffId"] ?: throw BadRequestException("Staff id is required")
            call.respond(ApiResponse.success(service.staffName(org, store, staff, call.authenticatedPrincipal()), call.callId))
        }
        post("/eligibility") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            val request = call.receive<CounterRedeemRequest>()
            call.respond(ApiResponse.success(service.eligibility(org, request.storeId, request.staffId,
                request.subscriptionId, request.benefitIds, call.authenticatedPrincipal()), call.callId))
        }

        // Counter purchases must use the one business-bound OTP flow.
        post("/purchases") {
            throw BadRequestException("Counter purchase requires business OTP verification")
        }
        post("/purchases/otp/request") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            call.respond(ApiResponse.success(
                service.requestPurchaseOtp(org, call.receive<CounterBusinessOtpRequest>(), call.authenticatedPrincipal()),
                call.callId
            ))
        }
        post("/purchases/otp/complete") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            call.respond(ApiResponse.success(
                service.verifyPurchaseOtp(org, call.receive<CounterBusinessOtpCompleteRequest>(), call.authenticatedPrincipal()),
                call.callId
            ))
        }
        post("/purchases/otp/finalize") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            call.respond(HttpStatusCode.Created, ApiResponse.success(
                service.finalizePurchaseOtp(org, call.receive<CounterBusinessOtpFinalizeRequest>(), call.authenticatedPrincipal()),
                call.callId
            ))
        }

        // Phone/manual redemption uses one action-bound OTP. QR remains OTP-free.
        post("/redemptions") {
            throw BadRequestException("Counter redemption requires business OTP verification")
        }
        post("/redemptions/otp/request") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            call.respond(ApiResponse.success(
                service.requestRedemptionOtp(org, call.receive<CounterBusinessOtpRequest>(), call.authenticatedPrincipal()),
                call.callId
            ))
        }
        post("/redemptions/otp/complete") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            call.respond(HttpStatusCode.Created, ApiResponse.success(
                service.completeRedemptionOtp(org, call.receive<CounterBusinessOtpCompleteRequest>(), call.authenticatedPrincipal()),
                call.callId
            ))
        }
        post("/qr-redemptions") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            call.respond(HttpStatusCode.Created, ApiResponse.success(
                service.redeemQr(org, call.receive<CounterQrRedeemRequest>(), call.authenticatedPrincipal()), call.callId))
        }
    }
}