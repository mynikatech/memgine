package com.mynikatech.memgine.component.counter

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.component.commerce.CounterCommercePaymentService
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.*
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import kotlin.coroutines.cancellation.CancellationException

private suspend inline fun <reified T : Any> ApplicationCall.receivePickupLookup(): T = try {
    receive<T>()
} catch (error: CancellationException) {
    throw error
} catch (_: Exception) {
    // Malformed JSON exceptions can include part of the credential.
    throw BadRequestException("Invalid pickup lookup request")
}

fun Route.counterRoutes(service: CounterService, commercePaymentService: CounterCommercePaymentService) {
    route("/organizations/{organizationId}/counter") {
        route("/orders") {
            post("/pickup/verify") {
                val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
                val store = call.request.queryParameters["storeId"] ?: throw BadRequestException("Store id is required")
                val staff = call.request.queryParameters["staffId"] ?: throw BadRequestException("Staff id is required")
                val principal = call.authenticatedPrincipal()
                val request = call.receivePickupLookup<CounterPickupQrRequest>()
                call.respond(ApiResponse.success(service.verifyPickup(org, store, staff, request.credential, principal), call.callId))
            }
            post("/pickup/reference") {
                val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
                val store = call.request.queryParameters["storeId"] ?: throw BadRequestException("Store id is required")
                val staff = call.request.queryParameters["staffId"] ?: throw BadRequestException("Staff id is required")
                val principal = call.authenticatedPrincipal()
                val request = call.receivePickupLookup<CounterPickupReferenceRequest>()
                call.respond(ApiResponse.success(service.pickupOrderReference(org, store, staff, request.reference, principal), call.callId))
            }
            get("/stores") {
                val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
                call.respond(ApiResponse.success(service.orderStores(org, call.authenticatedPrincipal()), call.callId))
            }
            get {
                val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
                val query = call.request.queryParameters
                val store = query["storeId"] ?: throw BadRequestException("Store id is required")
                val staff = query["staffId"] ?: throw BadRequestException("Staff id is required")
                call.respond(ApiResponse.success(service.orders(org, store, staff, query["status"], query["search"], query["pickupDate"],
                    query["limit"]?.toIntOrNull(), query["offset"]?.toIntOrNull(), call.authenticatedPrincipal()), call.callId))
            }
            get("/{orderId}") {
                val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
                val store = call.request.queryParameters["storeId"] ?: throw BadRequestException("Store id is required")
                val staff = call.request.queryParameters["staffId"] ?: throw BadRequestException("Staff id is required")
                val order = call.parameters["orderId"] ?: throw BadRequestException("Order id is required")
                call.respond(ApiResponse.success(service.order(org, store, staff, order, call.authenticatedPrincipal()), call.callId))
            }
            post("/{orderId}/actions/{action}") {
                val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
                val store = call.request.queryParameters["storeId"] ?: throw BadRequestException("Store id is required")
                val staff = call.request.queryParameters["staffId"] ?: throw BadRequestException("Staff id is required")
                val order = call.parameters["orderId"] ?: throw BadRequestException("Order id is required")
                val principal = call.authenticatedPrincipal()
                val action = call.parameters["action"]
                if (action == "start-terminal") {
                    val request = call.receive<CounterOrderTransitionRequest>()
                    call.respond(ApiResponse.success(service.startOrderTerminalPayment(org, store, staff, order, request.version, principal), call.callId))
                    return@post
                }
                if (action == "recover-terminal") {
                    val request = call.receive<CounterOrderTerminalRecoveryRequest>()
                    call.respond(ApiResponse.success(service.recoverOrderTerminalPayment(org, store, staff, order, request, principal), call.callId))
                    return@post
                }
                if (action == "request-pickup-otp") {
                    call.respond(ApiResponse.success(service.requestOrderPickupOtp(org, store, staff, order, principal), call.callId))
                    return@post
                }
                if (action == "authorize-pickup-otp") {
                    val request = call.receivePickupLookup<CounterOrderPickupOtpRequest>()
                    call.respond(ApiResponse.success(service.authorizeOrderPickupOtp(org, store, staff, order, request, principal), call.callId))
                    return@post
                }
                val command = when (action) {
                    "start-preparing" -> CounterOrderCommand.START_PREPARING
                    "mark-ready" -> CounterOrderCommand.MARK_READY
                    "complete-collection" -> CounterOrderCommand.COMPLETE_COLLECTION
                    "authorize-pickup-qr" -> CounterOrderCommand.AUTHORIZE_PICKUP_QR
                    "authorize-pickup-assisted" -> CounterOrderCommand.AUTHORIZE_PICKUP_ASSISTED
                    "start-cash" -> CounterOrderCommand.START_CASH
                    "confirm-cash" -> CounterOrderCommand.CONFIRM_CASH
                    "link-support" -> CounterOrderCommand.LINK_SUPPORT
                    "request-cancellation" -> CounterOrderCommand.REQUEST_CANCELLATION
                    "report-no-show" -> CounterOrderCommand.REPORT_NO_SHOW
                    else -> throw BadRequestException("Unknown Counter order action")
                }
                val result = if (command in setOf(CounterOrderCommand.AUTHORIZE_PICKUP_QR, CounterOrderCommand.AUTHORIZE_PICKUP_ASSISTED,
                        CounterOrderCommand.LINK_SUPPORT, CounterOrderCommand.REQUEST_CANCELLATION, CounterOrderCommand.REPORT_NO_SHOW)) {
                    val request = call.receivePickupLookup<CounterOrderCollectionRequest>()
                    service.updateOrder(org, store, staff, order, request.version, command, request.credential, principal)
                } else {
                    val request = call.receivePickupLookup<CounterOrderTransitionRequest>()
                    service.updateOrder(org, store, staff, order, request.version, command, null, principal)
                }
                call.respond(ApiResponse.success(result, call.callId))
            }
        }
        post("/customers/lookup") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            val store = call.request.queryParameters["storeId"] ?: throw BadRequestException("Store id is required")
            val staff = call.request.queryParameters["staffId"] ?: throw BadRequestException("Staff id is required")
            call.respond(ApiResponse.success(
                service.lookupCustomer(org, store, staff, call.receive(), call.authenticatedPrincipal()),
                call.callId
            ))
        }
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
            val principal = call.authenticatedPrincipal()
            val customerUserId = call.request.queryParameters["customerUserId"]
            val subscriptions = customerUserId?.let {
                service.subscriptionsForCustomer(org, store, staff, it, principal)
            } ?: service.subscriptions(org, store, staff, principal)
            call.respond(ApiResponse.success(subscriptions, call.callId))
        }
        
        get("/purchases/agreement/preview") {
            val org = call.parameters["organizationId"]
                ?: throw BadRequestException("Organization id is required")

            call.respond(
                ApiResponse.success(
                    service.counterAgreementPreview(
                        org = org,
                        challengeId = call.request.queryParameters["challengeId"],
                        counterPurchaseId = call.request.queryParameters["counterPurchaseId"],
                        principal = call.authenticatedPrincipal(),
                        offerId = call.request.queryParameters["explicitOfferId"]
                    ),
                    call.callId
                )
            )
        }

        post("/purchases/agreement/accept") {
            val org = call.parameters["organizationId"]
                ?: throw BadRequestException("Organization id is required")

            call.respond(
                ApiResponse.success(
                    service.counterAgreementAccept(
                        org,
                        call.receive<CounterAgreementAcceptanceRequest>(),
                        call.authenticatedPrincipal()
                    ),
                    call.callId
                )
            )
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
        get("/subscriptions/{subscriptionId}/redemption-selection") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            val subscriptionId = call.parameters["subscriptionId"] ?: throw BadRequestException("Subscription id is required")
            val store = call.request.queryParameters["storeId"] ?: throw BadRequestException("Store id is required")
            val staff = call.request.queryParameters["staffId"] ?: throw BadRequestException("Staff id is required")
            val customerUserId = call.request.queryParameters["customerUserId"]
                ?: throw BadRequestException("Customer user id is required")
            call.respond(ApiResponse.success(
                service.redemptionSelection(org, store, staff, subscriptionId, customerUserId, call.authenticatedPrincipal()),
                call.callId
            ))
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
        get("/purchases/quote") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            val store = call.request.queryParameters["storeId"] ?: throw BadRequestException("Store id is required")
            val staff = call.request.queryParameters["staffId"] ?: throw BadRequestException("Staff id is required")
            val planId = call.request.queryParameters["planId"] ?: throw BadRequestException("Membership plan id is required")
            val customerUserId = call.request.queryParameters["customerUserId"]
            val explicitOfferId = call.request.queryParameters["explicitOfferId"]
            call.respond(ApiResponse.success(
                service.purchaseQuote(org, store, staff, planId, customerUserId, call.authenticatedPrincipal(), explicitOfferId),
                call.callId
            ))
        }
        post("/purchases/offers/qr/resolve") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            val store = call.request.queryParameters["storeId"] ?: throw BadRequestException("Store id is required")
            val staff = call.request.queryParameters["staffId"] ?: throw BadRequestException("Staff id is required")
            val request = call.receive<CounterMembershipOfferQrResolveRequest>()
            call.respond(ApiResponse.success(
                service.resolveMembershipPurchaseOfferQr(
                    org, store, staff, request.token, call.authenticatedPrincipal()
                ),
                call.callId
            ))
        }
        post("/purchases/staff-assisted/prepare") {
            val org = call.parameters["organizationId"]
                ?: throw BadRequestException("Organization id is required")

            val request = call.receive<CounterPurchaseRequest>()

            call.respond(
                ApiResponse.success(
                    service.prepareStaffAssistedPurchase(
                        org,
                        request,
                        call.authenticatedPrincipal()
                    ),
                    call.callId
                )
            )
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
        
        post("/purchases/corporate-access/verify") {
            val org = call.parameters["organizationId"]
                ?: throw BadRequestException("Organization id is required")
            call.respond(ApiResponse.success(
                service.verifyCorporateCode(
                    org, call.receive<CounterCorporateCodeVerifyDto>(), call.authenticatedPrincipal()
                ), call.callId
            ))
        }
        post("/purchases/payment/start") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            call.respond(ApiResponse.success(
                service.startPurchasePayment(org, call.receive<PaymentStartRequestDto>(), call.authenticatedPrincipal()),
                call.callId
            ))
        }
        post("/purchases/payment/terminal/start") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            call.respond(ApiResponse.success(
                service.startTerminalPayment(org, call.receive<CounterCommercePaymentRequest>(), call.authenticatedPrincipal()),
                call.callId
            ))
        }
        post("/purchases/payment/terminal/result") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            call.respond(ApiResponse.success(
                service.recordTerminalPaymentResult(org, call.receive<CounterCommerceTerminalPaymentResultRequest>(), call.authenticatedPrincipal()),
                call.callId
            ))
        }
        post("/purchases/payment/remote-terminal/start") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            call.respond(ApiResponse.success(
                service.startRemoteTerminalPayment(org, call.receive<CounterCommercePaymentRequest>(), call.authenticatedPrincipal()),
                call.callId
            ))
        }
        post("/purchases/payment/cash/start") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            call.respond(ApiResponse.success(
                service.startCashPayment(org, call.receive<PaymentStartRequestDto>(), call.authenticatedPrincipal()),
                call.callId
            ))
        }
        post("/purchases/payment/cash/confirm") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            val confirmation = call.receive<CounterCashPaymentConfirmDto>()
            call.respond(HttpStatusCode.Created, ApiResponse.success(
                service.confirmCashPayment(org, confirmation.paymentIntentId, call.authenticatedPrincipal()),
                call.callId
            ))
        }

        // P4-B: fulfillment-only recovery for a verified Counter capture.
        // Counter authorization is enforced by the route gate and again in SQL.
        post("/commerce-transactions/{transactionId}/recover-fulfillment") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            val transactionId = call.parameters["transactionId"]
                ?: throw BadRequestException("Commerce transaction id is required")
            val recovered = commercePaymentService.recoverRemoteTerminalFulfillment(
                org, transactionId, call.authenticatedPrincipal().userId
            ) ?: throw BadRequestException("Counter fulfillment is unavailable")
            call.respond(ApiResponse.success(mapOf("commerceTransactionId" to recovered), call.callId))
        }
        // Phone/manual redemption uses one action-bound OTP. QR remains OTP-free.
        post("/redemptions") {
            throw BadRequestException("Counter redemption requires business OTP verification")
        }
        post("/redemptions/quote") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            call.respond(ApiResponse.success(
                service.quoteRedemption(org, call.receive<CounterRedemptionQuoteRequest>(), call.authenticatedPrincipal()),
                call.callId
            ))
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
