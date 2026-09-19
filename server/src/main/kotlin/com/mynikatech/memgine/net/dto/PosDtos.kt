package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

@Serializable data class RegisterPosDeviceRequest(val storeId: String, val deviceName: String)
@Serializable data class PosDeviceDto(val deviceId: String, val organizationId: String, val storeId: String, val storeName: String? = null, val deviceName: String, val revokedAt: String? = null, val lastSeenAt: String? = null)
@Serializable data class SetStaffPosPinRequest(val pin: String)
@Serializable data class PosStaffDto(val staffId: String, val displayName: String, val staffCode: String, val designation: String? = null, val pinConfigured: Boolean)
@Serializable data class PosContextDto(val organizationId: String, val organizationName: String, val storeId: String, val storeName: String, val deviceId: String, val deviceName: String, val staff: List<PosStaffDto>)
@Serializable data class PosUnlockRequest(val staffId: String, val pin: String)
