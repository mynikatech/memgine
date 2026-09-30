package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.exception.BadRequestException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

/** Whitelisted Payment Bridge fields only. Raw provider payload is never retained. */
data class PoyntPaymentBridgeCallback(val referenceId: String, val status: String, val transactions: List<PoyntPaymentBridgeTransaction>) {
    fun usableTransaction(): PoyntPaymentBridgeTransaction? = transactions.singleOrNull { it.id.isNotBlank() }
}
data class PoyntPaymentBridgeTransaction(val id: String, val status: String, val authOnly: Boolean, val amountMinor: Long?, val currencyCode: String?, val businessId: String?, val storeId: String?, val references: List<PoyntPaymentBridgeReference>)
data class PoyntPaymentBridgeReference(val type: String?, val id: String?, val customType: String?)

object PoyntPaymentBridgeCallbackParser {
    private val json = Json { ignoreUnknownKeys = true }
    fun parse(body: String): PoyntPaymentBridgeCallback {
        val root = try { json.parseToJsonElement(body).jsonObject } catch (_: Exception) { throw BadRequestException("Invalid Poynt Payment Bridge callback") }
        fun text(o: kotlinx.serialization.json.JsonObject, n: String) = o[n]?.jsonPrimitive?.contentOrNull
        val reference = text(root,"referenceId")?.trim()?.takeIf { it.isNotEmpty() } ?: throw BadRequestException("Poynt callback reference is required")
        val status = text(root,"status")?.trim()?.uppercase()?.takeIf { it.isNotEmpty() } ?: throw BadRequestException("Poynt callback status is required")
        val transactions = root["transactions"]?.jsonArray?.mapNotNull { element ->
            val t = element.jsonObject; val amounts = t["amounts"]?.jsonObject; val context = t["context"]?.jsonObject
            PoyntPaymentBridgeTransaction(text(t,"id").orEmpty(), text(t,"status")?.uppercase().orEmpty(), t["authOnly"]?.jsonPrimitive?.booleanOrNull ?: false,
                amounts?.get("transactionAmount")?.jsonPrimitive?.longOrNull, amounts?.get("currency")?.jsonPrimitive?.contentOrNull?.uppercase(),
                context?.get("businessId")?.jsonPrimitive?.contentOrNull, context?.get("storeId")?.jsonPrimitive?.contentOrNull,
                t["references"]?.jsonArray?.map { r -> val o=r.jsonObject; PoyntPaymentBridgeReference(text(o,"type"),text(o,"id"),text(o,"customType")) } ?: emptyList())
        } ?: emptyList()
        if (transactions.any { tx -> tx.references.any { it.id != null && it.customType == "referenceId" && it.id != reference } }) throw BadRequestException("Poynt callback reference conflicts")
        return PoyntPaymentBridgeCallback(reference,status,transactions)
    }
}

