package com.mynikatech.memgine.component.commerce

import kotlinx.serialization.Serializable

@Serializable
data class CounterTimeoutRecoveryRequest(
    val storeId: String,
    val staffId: String,
    val paymentAttemptId: String,
    val confirmedNoSuccessfulPayment: Boolean,
    val action: String
)

@Serializable
data class CounterTimeoutRecoveryResult(val status: String)
