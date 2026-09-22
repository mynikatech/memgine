package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

@Serializable
data class PaymentStartRequestDto(val challengeId: String, val idempotencyKey: String)

@Serializable
data class AuthenticatedMembershipPaymentStartDto(val planId: String, val idempotencyKey: String)

@Serializable
data class TestPaymentConfirmationDto(
    val status: String,
    val providerReferenceId: String? = null,
    val failureCode: String? = null,
    val failureMessage: String? = null
)

@Serializable
data class PaymentIntentDto(
    val paymentIntentId: String,
    val providerCode: String,
    val status: String,
    val amount: Double,
    val currencyCode: String,
    val providerReferenceId: String? = null,
    val failureCode: String? = null,
    val failureMessage: String? = null,
    val membershipPlanId: String,
    val customerUserId: String? = null,
    val finalizedSubscriptionId: String? = null,
    val createdAt: String
)

@Serializable
data class PaymentConfirmationDto(
    val payment: PaymentIntentDto,
    val subscription: CounterPurchaseResult? = null
)

@Serializable
data class CounterCashPaymentConfirmDto(val paymentIntentId: String)
