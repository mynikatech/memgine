package com.mynikatech.memgine.component.support

import kotlinx.serialization.Serializable

@Serializable data class CreateSupportRequestDto(val organizationId: String? = null, val destination: String = "BUSINESS", val category: String, val issueType: String, val subject: String, val description: String)
@Serializable data class AddSupportMessageDto(val messageBody: String)
@Serializable data class ReopenSupportRequestDto(val reason: String)
@Serializable data class SubmitSupportFeedbackDto(val rating: String? = null, val comment: String? = null)
@Serializable data class UpdateSupportRequestDto(val status: String? = null, val priority: String? = null, val assignedToUserId: String? = null, val resolutionSummary: String? = null, val versionNo: Int)
@Serializable data class SupportRequestCreatedDto(val supportRequestId: String, val ticketNumber: String)

@Serializable data class SupportRequestDto(
    var supportRequestId: String = "", var organizationId: String? = null, var customerUserId: String = "",
    var ticketNumber: String = "", var category: String = "", var issueType: String = "", var subject: String = "",
    var description: String = "", var source: String = "", var supportDestination: String = "BUSINESS", var status: String = "", var priority: String = "",
    var assignedToUserId: String? = null, var resolutionSummary: String? = null, var createdAt: String = "",
    var updatedAt: String = "", var resolvedAt: String? = null, var closedAt: String? = null, var versionNo: Int = 0
)
@Serializable data class SupportMessageDto(
    var supportMessageId: String = "", var supportRequestId: String = "", var organizationId: String = "",
    var authorUserId: String = "", var authorRole: String = "", var messageType: String = "",
    var messageBody: String = "", var isInternal: Boolean = false, var createdAt: String = "",
    var authorName: String? = null
)
@Serializable data class SupportEventDto(
    var eventId: String = "", var supportRequestId: String = "", var organizationId: String = "",
    var eventType: String = "", var previousStatus: String? = null, var newStatus: String? = null,
    var actorUserId: String? = null, var actorRole: String = "", var description: String = "", var createdAt: String = ""
)
@Serializable data class SupportFeedbackDto(var feedbackId: String = "", var supportRequestId: String = "", var customerUserId: String? = null, var rating: String? = null, var feedbackComment: String? = null, var submittedAt: String = "")
@Serializable data class SupportRequestDetailDto(val request: SupportRequestDto, val messages: List<SupportMessageDto>, val events: List<SupportEventDto>, val feedback: SupportFeedbackDto? = null)

@Serializable data class PaymentInvestigationDto(var investigationId:String="",var supportRequestId:String="",var financialExceptionId:String?=null,var source:String="",var state:String="",var escalationReason:String="",var paymentReference:String?=null,var investigationDescription:String?=null,var createdAt:String="",var updatedAt:String="")
@Serializable data class PaymentExceptionCandidateDto(var financialExceptionId:String="",var paymentIntentId:String?=null,var commerceTransactionId:String?=null,var providerReferenceId:String?=null,var amountMinor:Long=0,var currencyCode:String="",var caseStatus:String="",var fulfillmentOutcome:String="",var openedAt:String="")
@Serializable data class EscalatePaymentInvestigationDto(val reason:String,val paymentReference:String?=null,val description:String?=null)
@Serializable data class LinkPaymentExceptionDto(val financialExceptionId:String)
@Serializable data class UpdatePaymentInvestigationDto(val state:String,val reason:String)
