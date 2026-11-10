
package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.exception.BadRequestException
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.coroutines.delay

internal object CounterDevPoyntSimulator {

    enum class Outcome {
        SUCCESS,
        DECLINE,
        CANCEL
    }

    fun parseOutcome(value: String): Outcome =
        try {
            Outcome.valueOf(value.trim().uppercase())
        } catch (_: IllegalArgumentException) {
            throw BadRequestException(
                "Expected SUCCESS, DECLINE, or CANCEL"
            )
        }

    fun callbackJson(
        referenceId: String,
        providerTransactionId: String,
        amountMinor: Long,
        currencyCode: String,
        businessId: String?,
        storeId: String?,
        outcome: Outcome
    ): String {
        val callbackStatus = when (outcome) {
            Outcome.SUCCESS -> "PROCESSED"
            Outcome.DECLINE -> "FAILED"
            Outcome.CANCEL -> "CANCELED"
        }

        val transactionStatus = when (outcome) {
            Outcome.SUCCESS -> "CAPTURED"
            Outcome.DECLINE -> "DECLINED"
            Outcome.CANCEL -> "CANCELED"
        }

        return buildJsonObject {
            put("referenceId", referenceId)
            put("status", callbackStatus)

            put("transactions", buildJsonArray {
                add(buildJsonObject {
                    put("id", providerTransactionId)
                    put("status", transactionStatus)
                    put("authOnly", false)

                    put("amounts", buildJsonObject {
                        put("transactionAmount", amountMinor)
                        put("currency", currencyCode)
                    })

                    put("context", buildJsonObject {
                        businessId?.let { put("businessId", it) }
                        storeId?.let { put("storeId", it) }
                    })

                    put("references", buildJsonArray {
                        add(buildJsonObject {
                            put("type", "CUSTOM")
                            put("customType", "referenceId")
                            put("id", referenceId)
                        })
                    })

                    when (outcome) {
                        Outcome.DECLINE -> {
                            put("failureCode", "CARD_DECLINED")
                            put(
                                "failureMessage",
                                "Simulated card declined by issuer"
                            )
                        }

                        Outcome.CANCEL -> {
                            put("failureCode", "CUSTOMER_CANCELLED")
                            put(
                                "failureMessage",
                                "Simulated cancellation at terminal"
                            )
                        }

                        Outcome.SUCCESS -> Unit
                    }
                })
            })
        }.toString()
    }
}
