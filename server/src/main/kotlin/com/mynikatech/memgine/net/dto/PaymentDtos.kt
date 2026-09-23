package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

@Serializable
data class PaymentReturnContextDto(
    val productId: String? = null,
    val storeId: String? = null,
    val staffId: String? = null,
    val source: String? = null
)

@Serializable
data class PaymentStartRequestDto(
    val challengeId: String,
    val idempotencyKey: String,
    val returnContext: PaymentReturnContextDto? = null
)

@Serializable
data class AuthenticatedMembershipPaymentStartDto(
    val planId: String,
    val idempotencyKey: String,
    val returnContext: PaymentReturnContextDto? = null
)

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
    val createdAt: String,
    val checkoutUrl: String? = null,
    val monerisHostedTokenizationProfileId: String? = null,
    val monerisHostedTokenizationUrl: String? = null
)

@Serializable
data class MonerisPaymentConfirmationDto(
    val temporaryToken: String
)

@Serializable
data class PaymentConfirmationDto(
    val payment: PaymentIntentDto,
    val subscription: CounterPurchaseResult? = null
)

@Serializable
data class CounterCashPaymentConfirmDto(val paymentIntentId: String)
