package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

@Serializable data class PasswordLoginRequest(
    val phone: String, val regionCode: String? = null, val password: String
)
@Serializable data class OtpLoginRequest(
    val phone: String, val regionCode: String? = null
)
@Serializable data class OtpVerifyLoginRequest(
    val challengeId: String, val otp: String
)
@Serializable data class SetPasswordRequest(val password: String)
@Serializable data class OtpChallengeResponse(
    val challengeId: String, val expiresAt: String, val resendAt: String,
    val devCode: String? = null
)
@Serializable data class AuthAccessContextDto(
    val organizationId: String? = null,
    val organizationName: String? = null,
    val roles: List<String>,
    val capabilities: List<String>
)
@Serializable data class AuthSessionDto(
    val userId: String,
    val displayName: String,
    val expiresAt: String,
    val access: List<AuthAccessContextDto>
)
@Serializable data class LogoutResponse(val loggedOut: Boolean)
@Serializable data class SetPasswordResponse(val updated: Boolean)
