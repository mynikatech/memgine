package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.model.common.ApiResponse
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertTrue

class PaymentRefundSerializationTest {
    private val json = Json { explicitNulls = false; encodeDefaults = true }

    @Test
    fun `execution and reconciliation response envelopes are serializable`() {
        val unknown = PaymentRefundExecutionStatusDto(
            paymentRefundId = "PRF-1",
            executionStatus = "UNKNOWN_REQUIRES_RECONCILIATION",
            versionNo = 2
        )
        val succeeded = unknown.copy(
            executionStatus = "SUCCEEDED",
            providerRefundReference = "REFUND-1",
            versionNo = 3
        )

        listOf(unknown, succeeded).forEach { status ->
            val encoded = json.encodeToString(ApiResponse.success(status, "request-1"))
            assertTrue(encoded.contains("executionStatus"))
            assertTrue(encoded.contains(status.executionStatus))
        }
    }

    @Test
    fun `platform recovery route payloads carry only the selected reference and attestation`() {
        val request = PoyntCollectVerifiedReferenceRequestDto(
            organizationId = "ORG-1",
            paymentRefundAttemptId = "PRA-1",
            providerTransactionId = "REFUND-1",
            attestation = "Verified against the provider transaction record."
        )
        val confirmation = PoyntCollectVerifiedReferenceConfirmationDto("ORG-1", "PRA-1", "PRV-1")

        assertTrue(json.encodeToString(request).contains("providerTransactionId"))
        assertTrue(json.encodeToString(confirmation).contains("verificationId"))
    }
}
