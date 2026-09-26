package com.mynikatech.memgine.component.otp

import kotlinx.serialization.Serializable

enum class OtpPurpose { LOGIN, MEMBERSHIP_PURCHASE, REDEMPTION, PASSWORD_RESET, PHONE_VERIFICATION, HIGH_RISK_ACTION, MEMBERSHIP_QR_PURCHASE_VERIFY, COUNTER_PURCHASE_VERIFY, COUNTER_REDEMPTION_VERIFY, APP_MEMBERSHIP_PURCHASE_VERIFY }
enum class OtpChannel { SMS, WHATSAPP, EMAIL }
enum class OtpDeliveryMode { DEFAULT, MOCK, LIVE }

class OtpDeliveryModeResolver(private val environment: String, private val allowLiveSms: Boolean) {
    fun resolve(stored: String?): OtpDeliveryMode {
        val requested = runCatching { OtpDeliveryMode.valueOf(stored.orEmpty().uppercase()) }.getOrDefault(OtpDeliveryMode.DEFAULT)
        if (environment == "prod") return OtpDeliveryMode.LIVE
        if (requested == OtpDeliveryMode.LIVE && !allowLiveSms) throw IllegalStateException("Live SMS is disabled for this environment")
        return if (requested == OtpDeliveryMode.LIVE) OtpDeliveryMode.LIVE else OtpDeliveryMode.MOCK
    }
}

data class OtpDelivery(
    val destination: String,
    val regionCode: String,
    val purpose: OtpPurpose,
    val channel: OtpChannel,
    val code: String
)

data class OtpDeliveryResult(val providerCode: String, val devCode: String? = null)

interface OtpProvider {
    val providerCode: String
    fun supports(regionCode: String, channel: OtpChannel): Boolean
    fun send(delivery: OtpDelivery): OtpDeliveryResult
}

@Serializable
data class OtpRequestResult(
    val challengeId: String, val expiresAt: String, val resendAt: String,
    val destination: String, val devCode: String?
)

data class OtpVerificationResult(val destination: String)
