package com.mynikatech.memgine.component.activityaudit

import kotlinx.serialization.Serializable

@Serializable
data class ActivityAuditEventRequest(
    val eventType: String,
    val organizationId: String? = null,
    val storeId: String? = null,
    val staffId: String? = null,
    val membershipProductId: String? = null,
    val subscriptionId: String? = null,
    val platform: String = "UNKNOWN"
)
