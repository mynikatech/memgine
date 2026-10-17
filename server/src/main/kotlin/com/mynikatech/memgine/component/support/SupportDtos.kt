package com.mynikatech.memgine.component.support

import kotlinx.serialization.Serializable

@Serializable data class CreateSupportRequestDto(val organizationId: String, val category: String, val issueType: String, val subject: String, val description: String)
@Serializable data class AddSupportMessageDto(val messageBody: String)
@Serializable data class ReopenSupportRequestDto(val reason: String)
@Serializable data class UpdateSupportRequestDto(val status: String? = null, val priority: String? = null, val assignedToUserId: String? = null, val resolutionSummary: String? = null, val versionNo: Int)
@Serializable data class SupportRequestCreatedDto(val supportRequestId: String, val ticketNumber: String)

@Serializable data class SupportRequestDto(
    var supportRequestId: String = "", var organizationId: String = "", var customerUserId: String = "",
    var ticketNumber: String = "", var category: String = "", var issueType: String = "", var subject: String = "",
    var description: String = "", var source: String = "", var status: String = "", var priority: String = "",
    var assignedToUserId: String? = null, var resolutionSummary: String? = null, var createdAt: String = "",
    var updatedAt: String = "", var resolvedAt: String? = null, var closedAt: String? = null, var versionNo: Int = 0
)
@Serializable data class SupportMessageDto(
    var supportMessageId: String = "", var supportRequestId: String = "", var organizationId: String = "",
    var authorUserId: String = "", var authorRole: String = "", var messageType: String = "",
    var messageBody: String = "", var isInternal: Boolean = false, var createdAt: String = ""
)
@Serializable data class SupportEventDto(
    var eventId: String = "", var supportRequestId: String = "", var organizationId: String = "",
    var eventType: String = "", var previousStatus: String? = null, var newStatus: String? = null,
    var actorUserId: String? = null, var actorRole: String = "", var description: String = "", var createdAt: String = ""
)
@Serializable data class SupportRequestDetailDto(val request: SupportRequestDto, val messages: List<SupportMessageDto>, val events: List<SupportEventDto>)
