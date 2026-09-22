package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

@Serializable
data class PoyntCreatePairingCodeRequest(
    val storeId: String
)

@Serializable
data class PoyntPairingCodeDto(
    val pairingId: String,
    val pairingCode: String,
    val organizationId: String,
    val storeId: String,
    val expiresAt: String
)

@Serializable
data class PoyntCompletePairingRequest(
    val pairingCode: String,
    val poyntBusinessId: String,
    val poyntStoreId: String,
    val poyntTerminalId: String,
    val deviceName: String
)

@Serializable
data class PoyntTerminalPairingDto(
    val terminalCredential: String,
    val deviceId: String,
    val organizationId: String,
    val organizationName: String,
    val storeId: String,
    val storeName: String,
    val deviceName: String
)

@Serializable
data class PoyntTerminalUnlockRequest(
    val staffId: String,
    val pin: String
)
