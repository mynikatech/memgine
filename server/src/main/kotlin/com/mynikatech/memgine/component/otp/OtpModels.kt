package com.mynikatech.memgine.component.otp

import kotlinx.serialization.Serializable

enum class OtpPurpose { LOGIN, MEMBERSHIP_PURCHASE, REDEMPTION, PASSWORD_RESET, PHONE_VERIFICATION, HIGH_RISK_ACTION, MEMBERSHIP_QR_PURCHASE_VERIFY, COUNTER_PURCHASE_VERIFY, COUNTER_REDEMPTION_VERIFY, APP_MEMBERSHIP_PURCHASE_VERIFY }
enum class OtpChannel { SMS, WHATSAPP, EMAIL }

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
