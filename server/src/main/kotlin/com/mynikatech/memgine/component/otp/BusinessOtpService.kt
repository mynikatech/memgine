package com.mynikatech.memgine.component.otp

import com.mynikatech.memgine.exception.BadRequestException
import java.util.UUID

/** Binds a central OTP challenge to one server-side business action. */
class BusinessOtpService(
    private val otp: OtpService,
    private val sql: BusinessOtpSql
) {
    fun request(
        phone: String,
        regionCode: String?,
        purpose: OtpPurpose,
        organizationId: String,
        storeId: String? = null,
        planId: String? = null,
        subscriptionId: String? = null,
        userId: String? = null,
        staffId: String? = null,
        benefitIdsJson: String? = null,
        payloadJson: String = "{}"
    ): OtpRequestResult {
        requireBusinessPurpose(purpose)

        val challenge = otp.request(phone, regionCode, purpose)

        sql.create(
            UUID.randomUUID().toString(),
            challenge.challengeId,
            purpose.name,
            organizationId,
            storeId,
            planId,
            subscriptionId,
            userId,
            staffId,
            challenge.destination,
            benefitIdsJson,
            payloadJson
        )

        return challenge
    }

    /**
     * Verifies the central OTP and resolves its still-unconsumed business binding.
     * Business context consumption is deliberately separate so callers can
     * revalidate and execute the business mutation before burning the binding.
     */
    fun verifyAndResolve(
        challengeId: String,
        code: String,
        purpose: OtpPurpose
    ): BusinessOtpContextRow {
        requireBusinessPurpose(purpose)

        otp.verify(challengeId, code, purpose)

        return sql.resolve(challengeId, purpose.name)
            ?: throw BadRequestException("Business verification is invalid or already used")
    }

    /**
     * Resolves a business context only after the central OTP has already been
     * verified/consumed. This lets payment happen after OTP verification while
     * keeping the business context available for one final mutation.
     */
    fun resolveVerified(
        challengeId: String,
        purpose: OtpPurpose
    ): BusinessOtpContextRow {
        requireBusinessPurpose(purpose)

        return sql.resolve(challengeId, purpose.name)
            ?: throw BadRequestException("Business verification is invalid or already used")
    }

    fun consume(challengeId: String, purpose: OtpPurpose) {
        requireBusinessPurpose(purpose)

        if (!sql.consume(challengeId, purpose.name)) {
            throw BadRequestException("Business verification is invalid or already used")
        }
    }

    private fun requireBusinessPurpose(purpose: OtpPurpose) {
        if (purpose !in BUSINESS_PURPOSES) {
            throw BadRequestException("Invalid business verification purpose")
        }
    }

    companion object {
        val BUSINESS_PURPOSES = setOf(
            OtpPurpose.MEMBERSHIP_QR_PURCHASE_VERIFY,
            OtpPurpose.COUNTER_PURCHASE_VERIFY,
            OtpPurpose.COUNTER_REDEMPTION_VERIFY,
            OtpPurpose.APP_MEMBERSHIP_PURCHASE_VERIFY
        )
    }
}