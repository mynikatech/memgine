package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.route
import kotlinx.serialization.Serializable
import org.jdbi.v3.core.Jdbi
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

@Serializable
data class OrgPaymentInvestigationDto(
    var paymentIntentId: String = "", var customerUserId: String? = null,
    var customerName: String? = null, var paymentStatus: String = "",
    var providerCode: String = "", var providerReference: String? = null,
    var amountMinor: Long = 0, var currencyCode: String = "",
    var createdAt: String = "", var storeId: String? = null,
    var staffId: String? = null, var authorizationMode: String? = null,
    var subscriptionId: String? = null, var membershipPlanId: String? = null,
    var attemptCount: Long = 0, var latestAttemptStatus: String? = null,
    var refundedMinor: Long = 0, var reservedRefundMinor: Long = 0,
    var financialExceptionId: String? = null
)

interface OrgTransactionInvestigationSql {
    @SqlQuery("SELECT * FROM org_transaction_payment_list(:org,:actor,:support)")
    @RegisterBeanMapper(OrgPaymentInvestigationDto::class)
    fun list(@Bind("org") org: String, @Bind("actor") actor: String,
             @Bind("support") support: String?): List<OrgPaymentInvestigationDto>
}

fun Route.orgTransactionInvestigationRoutes(jdbi: Jdbi) {
    route("/organizations/{organizationId}/transaction-investigation") {
        get("/payments") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id required")
            call.respond(ApiResponse.success(jdbi.onDemand(OrgTransactionInvestigationSql::class.java)
                .list(org,call.authenticatedPrincipal().userId,null), call.callId))
        }
        get("/support/{supportRequestId}/payments") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id required")
            val support = call.parameters["supportRequestId"] ?: throw BadRequestException("Support request id required")
            call.respond(ApiResponse.success(jdbi.onDemand(OrgTransactionInvestigationSql::class.java)
                .list(org,call.authenticatedPrincipal().userId,support), call.callId))
        }
    }
}
