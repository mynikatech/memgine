package com.mynikatech.memgine.component.organizationaccess

import kotlinx.serialization.Serializable

@Serializable
data class SetOrganizationAdminRequest(val enabled: Boolean)

@Serializable
data class SetOrganizationMembershipRequest(val active: Boolean)

@Serializable
data class SetCounterOperatorRequest(
    val enabled: Boolean,
    val designation: String? = null,
    val primaryStoreId: String? = null
)

@Serializable
data class SetStaffStoresRequest(
    val primaryStoreId: String? = null,
    val additionalStoreIds: List<String> = emptyList()
)

@Serializable
data class SetPosPinRequest(val pin: String)
