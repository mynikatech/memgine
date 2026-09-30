package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.net.dto.CommerceTransactionDetailDto

/** Memgine fulfillment remains separate from provider checkout. Implementations will
 * invoke existing redemption/subscription primitives only after provider success. */
interface CommerceFulfillmentExecutor {
    fun fulfill(transaction: CommerceTransactionDetailDto): CommerceFulfillmentResult
}

data class CommerceFulfillmentResult(
    val completed: Boolean,
    val failureCode: String? = null,
    val failureMessage: String? = null
)

object UnavailableCommerceFulfillmentExecutor : CommerceFulfillmentExecutor {
    override fun fulfill(transaction: CommerceTransactionDetailDto) =
        CommerceFulfillmentResult(false, "FULFILLMENT_NOT_CONFIGURED", "Commerce fulfillment is not configured")
}