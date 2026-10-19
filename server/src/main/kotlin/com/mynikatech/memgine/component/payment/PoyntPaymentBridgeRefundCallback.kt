package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.exception.BadRequestException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.booleanOrNull

/** Whitelisted callback fields; never persist cardholder or raw transaction payloads. */
data class PoyntBridgeRefundTransaction(
    val id: String,
    val status: String,
    val action: String,
    val parentId: String?,
    val processorStatus: String?,
    val approvedAmount: Long?,
    val invalidApprovedAmount: Boolean,
    val authOnly: Boolean,
    val amountMinor: Long?,
    val currencyCode: String?,
    val businessId: String?,
    val storeId: String?
)

data class PoyntBridgeRefundCallback(
    val referenceId: String,
    val status: String,
    val transactions: List<PoyntBridgeRefundTransaction>
) {
    fun usableRefundTransaction(): PoyntBridgeRefundTransaction? =
        transactions.singleOrNull()?.takeIf { it.id.isNotBlank() && it.action == "REFUND" }
}

object PoyntPaymentBridgeRefundCallbackParser {
    private val json=Json { ignoreUnknownKeys=true }
    private fun value(o:JsonObject,key:String):String? =
        o[key]?.jsonPrimitive?.contentOrNull?.trim()?.takeIf { it.isNotBlank() }

    fun parse(body:String):PoyntBridgeRefundCallback {
        val root=try { json.parseToJsonElement(body).jsonObject }
            catch (_:Exception) { throw BadRequestException("Invalid Poynt Bridge refund callback") }
        val reference=value(root,"referenceId")?.takeIf { it.length<=160 }
            ?:throw BadRequestException("Bridge refund reference is required")
        val status=value(root,"status")?.uppercase()
            ?:throw BadRequestException("Bridge refund callback status is required")
        if(status !in setOf("RECEIVED","STARTED","PROCESSED","FAILED","CANCELED"))
            throw BadRequestException("Unknown Bridge refund callback status")
        val elements=try { root["transactions"]?.jsonArray ?: emptyList() }
            catch (_:Exception) { throw BadRequestException("Malformed Bridge refund transactions") }
        if(elements.size>4) throw BadRequestException("Ambiguous Bridge refund callback")
        val transactions=try { elements.map { el ->
            val o=el.jsonObject
            val refs=o["references"]?.jsonArray ?: emptyList()
            if (refs.any { ref ->
                    val v=ref.jsonObject
                    value(v,"customType")=="referenceId" &&
                        value(v,"id") != reference
                }) throw BadRequestException("Conflicting Bridge refund reference")
            val amounts=o["amounts"]?.jsonObject
            val context=o["context"]?.jsonObject
            val processor=o["processorResponse"]?.jsonObject
            val approved=processor?.get("approvedAmount")?.jsonPrimitive?.longOrNull
            PoyntBridgeRefundTransaction(
                id=value(o,"id").orEmpty(),
                status=value(o,"status")?.uppercase().orEmpty(),
                action=(value(o,"action") ?: value(o,"type")).orEmpty().uppercase(),
                parentId=value(o,"parentId"),
                processorStatus=processor?.let { value(it,"status") },
                approvedAmount=approved,
                invalidApprovedAmount=processor?.containsKey("approvedAmount") == true && approved==null,
                authOnly=o["authOnly"]?.jsonPrimitive?.booleanOrNull ?: false,
                amountMinor=amounts?.get("transactionAmount")?.jsonPrimitive?.longOrNull,
                currencyCode=amounts?.let { value(it,"currency") }?.uppercase(),
                businessId=context?.let { value(it,"businessId") },
                storeId=context?.let { value(it,"storeId") }
            )
        }} catch (_:Exception) { throw BadRequestException("Malformed Bridge refund transaction") }
        return PoyntBridgeRefundCallback(reference,status,transactions)
    }
}
