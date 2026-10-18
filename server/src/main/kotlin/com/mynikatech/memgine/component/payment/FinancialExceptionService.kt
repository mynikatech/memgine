package com.mynikatech.memgine.component.payment

import kotlinx.serialization.Serializable
import org.jdbi.v3.core.Jdbi
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery
import com.mynikatech.memgine.component.support.PaymentExceptionSupportLinkService

@Serializable
data class FinancialExceptionSummaryDto(
    var financialExceptionId: String = "", var sourceChannel: String = "", var providerCode: String = "",
    var providerReferenceId: String? = null, var providerTransactionId: String? = null,
    var amountMinor: Long = 0, var currencyCode: String = "", var caseStatus: String = "",
    var fulfillmentOutcome: String = "", var openedAt: String = "", var updatedAt: String = "",
    var resolvedAt: String? = null
)

@Serializable
data class FinancialExceptionDetailDto(
    var financialExceptionId: String = "", var paymentIntentId: String? = null,
    var commerceTransactionId: String? = null, var sourceChannel: String = "", var providerCode: String = "",
    var providerReferenceId: String? = null, var providerTransactionId: String? = null,
    var amountMinor: Long = 0, var currencyCode: String = "", var classification: String = "",
    var evidenceReason: String? = null, var caseStatus: String = "", var fulfillmentOutcome: String = "",
    var openedAt: String = "", var updatedAt: String = "", var resolvedAt: String? = null
)

@Serializable
data class FinancialExceptionEventDto(
    var eventId: String = "", var eventType: String = "", var previousCaseStatus: String? = null,
    var newCaseStatus: String? = null, var previousFulfillmentOutcome: String? = null,
    var newFulfillmentOutcome: String? = null, var actorUserId: String? = null,
    var actorOrigin: String = "", var description: String = "", var createdAt: String = ""
)

@Serializable
data class FinancialExceptionTransitionRequest(val newStatus: String, val reason: String)

@RegisterBeanMapper(FinancialExceptionSummaryDto::class)
interface FinancialExceptionSql {
    @SqlQuery("SELECT * FROM financial_exception_list(:organizationId, :actorUserId)")
    fun list(@Bind("organizationId") organizationId: String, @Bind("actorUserId") actorUserId: String): List<FinancialExceptionSummaryDto>
    @SqlQuery("SELECT * FROM financial_exception_detail(:organizationId, :exceptionId, :actorUserId)") @RegisterBeanMapper(FinancialExceptionDetailDto::class)
    fun detail(@Bind("organizationId") organizationId: String, @Bind("exceptionId") exceptionId: String, @Bind("actorUserId") actorUserId: String): FinancialExceptionDetailDto?
    @SqlQuery("SELECT * FROM financial_exception_events(:organizationId, :exceptionId, :actorUserId)") @RegisterBeanMapper(FinancialExceptionEventDto::class)
    fun events(@Bind("organizationId") organizationId: String, @Bind("exceptionId") exceptionId: String, @Bind("actorUserId") actorUserId: String): List<FinancialExceptionEventDto>
    @SqlQuery("SELECT financial_exception_transition(:organizationId, :exceptionId, :newStatus, :reason, :actorUserId)")
    fun transition(@Bind("organizationId") organizationId: String, @Bind("exceptionId") exceptionId: String, @Bind("newStatus") newStatus: String, @Bind("reason") reason: String, @Bind("actorUserId") actorUserId: String): Boolean
}

class FinancialExceptionService(private val jdbi: Jdbi) {
    private fun sql() = jdbi.onDemand(FinancialExceptionSql::class.java)
    fun list(org: String, actor: String) = sql().list(org, actor)
    fun detail(org: String, id: String, actor: String) = sql().detail(org, id, actor)
    fun events(org: String, id: String, actor: String) = sql().events(org, id, actor)
    fun transition(org: String, id: String, request: FinancialExceptionTransitionRequest, actor: String) = sql().transition(org, id, request.newStatus, request.reason, actor)
    fun reconcileSupportLinks(limit: Int?) = PaymentExceptionSupportLinkService(jdbi).reconcileEligible(limit ?: 50)
}
